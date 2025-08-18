using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

public static class GameEndpoints
{
    public static void MapGameEndpoints(this WebApplication app, Func<string> cs)
    {
        // GET: últimos 50 partidos
        app.MapGet("/api/games", async () =>
        {
            using var conn = new SqlConnection(cs());
            var rows = await conn.QueryAsync("SELECT TOP 50 * FROM MarcadorDB.dbo.Games ORDER BY GameId DESC;");
            return Results.Ok(rows);
        })
        .WithName("GetGames")
        .WithOpenApi();

        // POST: crear partido (+ crea reloj con 12 min por cuarto)
        app.MapPost("/api/games", async ([FromBody] CreateGameDto body) =>
        {
            var home = string.IsNullOrWhiteSpace(body?.Home) ? "Local" : body!.Home.Trim();
            var away = string.IsNullOrWhiteSpace(body?.Away) ? "Visitante" : body!.Away.Trim();

            using var conn = new SqlConnection(cs());
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();

            var id = await conn.ExecuteScalarAsync<int>(@"
                INSERT INTO MarcadorDB.dbo.Games(HomeTeam, AwayTeam, CreatedAt)
                OUTPUT INSERTED.GameId
                VALUES(@home, @away, SYSUTCDATETIME());
            ", new { home, away }, tx);

            await conn.ExecuteAsync(@"
                IF NOT EXISTS (SELECT 1 FROM MarcadorDB.dbo.GameClocks WHERE GameId=@id)
                INSERT INTO MarcadorDB.dbo.GameClocks(GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt)
                VALUES(@id, 1, 600000, 600000, 0, NULL, SYSUTCDATETIME());
            ", new { id }, tx);

            tx.Commit();
            return Results.Created($"/api/games/{id}", new { GameId = id, Home = home, Away = away });
        })
        .WithName("CreateGame")
        .WithOpenApi();

        // GET: detalle de juego + últimos eventos
        app.MapGet("/api/games/{id:int}", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            var game = await conn.QuerySingleOrDefaultAsync(
                "SELECT * FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id });
            if (game is null) return Results.NotFound();

            var events = await conn.QueryAsync(
                "SELECT TOP 100 * FROM MarcadorDB.dbo.GameEvents WHERE GameId=@id ORDER BY EventId DESC;", new { id });

            return Results.Ok(new { game, events });
        })
        .WithName("GetGameById")
        .WithOpenApi();

        // POST: iniciar partido (Status -> IN_PROGRESS) + arrancar reloj
        app.MapPost("/api/games/{id:int}/start", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();

            var affected = await conn.ExecuteAsync(@"
                UPDATE MarcadorDB.dbo.Games
                SET Status='IN_PROGRESS'
                WHERE GameId=@id AND Status='SCHEDULED';
            ", new { id }, tx);

            if (affected > 0)
            {
                await conn.ExecuteAsync(@"
                    UPDATE MarcadorDB.dbo.GameClocks
                    SET Running=1, StartedAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME()
                    WHERE GameId=@id;
                ", new { id }, tx);

                tx.Commit();
                return Results.NoContent();
            }
            tx.Rollback();
            return Results.BadRequest(new { error = "No se pudo iniciar (¿no existe o no está SCHEDULED?)." });
        })
        .WithName("StartGame")
        .WithOpenApi();

        // POST: avanzar de cuarto (máximo 4) + reset de reloj
        app.MapPost("/api/games/{id:int}/advance-quarter", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();

            var current = await conn.QuerySingleOrDefaultAsync<(int Quarter, string Status)>(
                "SELECT Quarter, Status FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id }, tx);

            if (current == default)
            { tx.Rollback(); return Results.NotFound(); }
            if (!string.Equals(current.Status, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
            { tx.Rollback(); return Results.BadRequest(new { error = "El juego no está en progreso." }); }
            if (current.Quarter >= 4)
            { tx.Rollback(); return Results.BadRequest(new { error = "Ya estás en el último cuarto." }); }

            await conn.ExecuteAsync("UPDATE MarcadorDB.dbo.Games SET Quarter = Quarter + 1 WHERE GameId=@id;",
                new { id }, tx);

            await conn.ExecuteAsync(@"
                UPDATE c SET
                    Running=0,
                    RemainingMs=QuarterMs,
                    StartedAt=NULL,
                    UpdatedAt=SYSUTCDATETIME()
                FROM MarcadorDB.dbo.GameClocks c
                WHERE c.GameId=@id;
            ", new { id }, tx);

            tx.Commit();
            return Results.NoContent();
        })
        .WithName("AdvanceQuarter")
        .WithOpenApi();

        // POST: registrar puntos (solo si IN_PROGRESS)
        app.MapPost("/api/games/{id:int}/score", async (int id, [FromBody] ScoreDto body) =>
        {
            var team = (body?.Team ?? "").ToUpperInvariant();
            var pts = body?.Points ?? 0;
            if ((team != "HOME" && team != "AWAY") || (pts != 1 && pts != 2 && pts != 3))
                return Results.BadRequest(new { error = "Team debe ser HOME/AWAY y Points 1|2|3." });

            using var conn = new SqlConnection(cs());
            var st = await conn.QuerySingleOrDefaultAsync<string>(
                "SELECT Status FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id });
            if (!string.Equals(st, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "No se puede anotar si el juego no está IN_PROGRESS." });

            var sqlUpdate = team == "HOME"
                ? "UPDATE MarcadorDB.dbo.Games SET HomeScore = HomeScore + @pts WHERE GameId=@id;"
                : "UPDATE MarcadorDB.dbo.Games SET AwayScore = AwayScore + @pts WHERE GameId=@id;";

            var affected = await conn.ExecuteAsync(@$"
                {sqlUpdate}
                INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber)
                  SELECT @id, Quarter, @team, @etype, NULL
                  FROM MarcadorDB.dbo.Games WHERE GameId=@id;",
                new { id, team, pts, etype = $"POINT_{pts}" });

            return affected > 0 ? Results.NoContent()
                                : Results.BadRequest(new { error = "No se pudo registrar la puntuación." });
        })
        .WithName("Score")
        .WithOpenApi();

        // POST: falta (solo si IN_PROGRESS)
        app.MapPost("/api/games/{id:int}/foul", async (int id, [FromBody] FoulDto body) =>
        {
            var team = (body?.Team ?? "").ToUpperInvariant();
            if (team != "HOME" && team != "AWAY")
                return Results.BadRequest(new { error = "Team debe ser HOME o AWAY." });

            using var conn = new SqlConnection(cs());
            var st = await conn.QuerySingleOrDefaultAsync<string>(
                "SELECT Status FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id });
            if (!string.Equals(st, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "No se puede registrar falta si el juego no está IN_PROGRESS." });

            var affected = await conn.ExecuteAsync(@"
                INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber)
                  SELECT @id, Quarter, @team, 'FOUL', NULL
                  FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id, team });

            return affected > 0 ? Results.NoContent()
                                : Results.BadRequest(new { error = "No se pudo registrar la falta." });
        })
        .WithName("Foul")
        .WithOpenApi();

        // POST: finalizar (Status -> FINISHED) + pausar reloj
        app.MapPost("/api/games/{id:int}/finish", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();

            var affected = await conn.ExecuteAsync(@"
                UPDATE MarcadorDB.dbo.Games
                SET Status='FINISHED'
                WHERE GameId=@id AND Status='IN_PROGRESS';
            ", new { id }, tx);

            if (affected > 0)
            {
                await conn.ExecuteAsync(@"
                    UPDATE MarcadorDB.dbo.GameClocks
                    SET Running=0, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME()
                    WHERE GameId=@id;
                ", new { id }, tx);

                tx.Commit();
                return Results.NoContent();
            }
            tx.Rollback();
            return Results.BadRequest(new { error = "No se pudo finalizar (¿no está IN_PROGRESS?)." });
        })
        .WithName("FinishGame")
        .WithOpenApi();

        // POST: deshacer último evento (POINT_* o FOUL)
        app.MapPost("/api/games/{id:int}/undo", async (int id) =>
        {
            using var conn = new SqlConnection(cs());

            var ev = await conn.QuerySingleOrDefaultAsync<dynamic>(@"
                SELECT TOP 1 * FROM MarcadorDB.dbo.GameEvents
                WHERE GameId=@id AND EventType IN ('POINT_1','POINT_2','POINT_3','FOUL')
                ORDER BY EventId DESC;", new { id });

            if (ev is null) return Results.BadRequest(new { error = "No hay evento deshacible." });

            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();

            try
            {
                string evType = ev.EventType;
                string team = ev.Team;
                int pts = evType.StartsWith("POINT_") ? int.Parse(((string)evType).Substring(6)) : 0;

                if (pts > 0)
                {
                    var scores = await conn.QuerySingleAsync<(int HomeScore, int AwayScore)>(
                        "SELECT HomeScore, AwayScore FROM MarcadorDB.dbo.Games WHERE GameId=@id;",
                        new { id }, tx);

                    if (string.Equals(team, "HOME", StringComparison.OrdinalIgnoreCase))
                    {
                        if (scores.HomeScore - pts < 0)
                            return Results.BadRequest(new { error = "Dejaría HOME en negativo." });

                        await conn.ExecuteAsync("UPDATE MarcadorDB.dbo.Games SET HomeScore = HomeScore - @pts WHERE GameId=@id;",
                            new { id, pts }, tx);
                    }
                    else
                    {
                        if (scores.AwayScore - pts < 0)
                            return Results.BadRequest(new { error = "Dejaría AWAY en negativo." });

                        await conn.ExecuteAsync("UPDATE MarcadorDB.dbo.Games SET AwayScore = AwayScore - @pts WHERE GameId=@id;",
                            new { id, pts }, tx);
                    }
                }

                await conn.ExecuteAsync(@"
                    INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber)
                      VALUES (@id, @q, @team, 'UNDO', NULL);
                    DELETE FROM MarcadorDB.dbo.GameEvents WHERE EventId=@eid;",
                    new { id, q = (byte)ev.Quarter, team, eid = (int)ev.EventId }, tx);

                tx.Commit();
                return Results.NoContent();
            }
            catch
            {
                tx.Rollback();
                throw;
            }
        })
        .WithName("Undo")
        .WithOpenApi();
    }
}
