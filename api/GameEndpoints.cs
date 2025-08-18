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
            var st = await conn.ExecuteScalarAsync<string>(
                "SELECT Status FROM MarcadorDB.dbo.Games WHERE GameId=@id;", new { id });
            if (!string.Equals(st, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "No se puede registrar falta si el juego no está IN_PROGRESS." });

            var ok = await conn.ExecuteAsync(@"
                INSERT INTO MarcadorDB.dbo.GameEvents(GameId, Quarter, Team, EventType, PlayerNumber, PlayerId)
                SELECT @id, Quarter, @team, 'FOUL', @pnum, @pid
                FROM MarcadorDB.dbo.Games WHERE GameId=@id;",
                new { id, team, pnum = body?.PlayerNumber, pid = body?.PlayerId });

            return ok > 0 ? Results.NoContent() : Results.BadRequest(new { error = "No se pudo registrar la falta." });
        })
        .WithName("foul")
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

        // GET: equipos
        app.MapGet("/api/teams", async () =>
        {
            using var conn = new SqlConnection(cs());
            var rows = await conn.QueryAsync("SELECT TeamId, Name, CreatedAt FROM MarcadorDB.dbo.Teams ORDER BY Name ASC;");
            return Results.Ok(rows);
        })
        .WithName("GetTeams")
        .WithOpenApi();

        // POST: registrar equipo
        app.MapPost("/api/teams", async ([FromBody] TeamCreateDto body) =>
        {
            var name = (body?.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name))
                return Results.BadRequest(new { error = "El nombre es requerido." });

            using var conn = new SqlConnection(cs());
            try
            {
                var id = await conn.ExecuteScalarAsync<int>(@"
            INSERT INTO MarcadorDB.dbo.Teams(Name) OUTPUT INSERTED.TeamId VALUES(@name);
        ", new { name });
                return Results.Created($"/api/teams/{id}", new { teamId = id, name });
            }
            catch (SqlException ex) when (ex.Number == 2627) // UNIQUE
            {
                return Results.Conflict(new { error = "Ya existe un equipo con ese nombre." });
            }
        })
            .WithName("CreateTeam")
            .WithOpenApi();

        // POST: emparejar partido desde Teams (homeTeamId, awayTeamId)
        app.MapPost("/api/games/pair", async ([FromBody] PairDto body) =>
        {
            if (body is null || body.HomeTeamId <= 0 || body.AwayTeamId <= 0 || body.HomeTeamId == body.AwayTeamId)
                return Results.BadRequest(new { error = "Debes elegir dos equipos válidos y distintos." });

            using var conn = new SqlConnection(cs());
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();

            // obtener nombres
            var teams = (await conn.QueryAsync<(int TeamId, string Name)>(
                "SELECT TeamId, Name FROM MarcadorDB.dbo.Teams WHERE TeamId IN (@h,@a);",
                new { h = body.HomeTeamId, a = body.AwayTeamId }, tx)).AsList();

            var home = teams.FirstOrDefault(t => t.TeamId == body.HomeTeamId).Name;
            var away = teams.FirstOrDefault(t => t.TeamId == body.AwayTeamId).Name;
            if (string.IsNullOrEmpty(home) || string.IsNullOrEmpty(away))
            { tx.Rollback(); return Results.BadRequest(new { error = "Equipo no encontrado." }); }

            // crear juego con IDs + nombres
            var id = await conn.ExecuteScalarAsync<int>(@"
                INSERT INTO MarcadorDB.dbo.Games(HomeTeam, AwayTeam, HomeTeamId, AwayTeamId, Status, CreatedAt)
                OUTPUT INSERTED.GameId
                VALUES(@home, @away, @homeId, @awayId, 'SCHEDULED', SYSUTCDATETIME());
            ", new { home, away, homeId = body.HomeTeamId, awayId = body.AwayTeamId }, tx);


                    // crear reloj
                    await conn.ExecuteAsync(@"
                INSERT INTO MarcadorDB.dbo.GameClocks(GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt)
                VALUES(@id, 1, 600000, 600000, 0, NULL, SYSUTCDATETIME());
            ", new { id }, tx);

            tx.Commit();
            return Results.Created($"/api/games/{id}", new { gameId = id, home, away });
        })
        .WithName("PairGame")
        .WithOpenApi();

        // GET jugadores de un equipo
        app.MapGet("/api/teams/{teamId:int}/players", async (int teamId) =>
        {
            using var conn = new SqlConnection(cs());
            var rows = await conn.QueryAsync(@"
            SELECT PlayerId, TeamId, Number, Name, Position, Active, CreatedAt
            FROM MarcadorDB.dbo.Players
            WHERE TeamId=@teamId
            ORDER BY COALESCE(Number,255), Name;", new { teamId });
            return Results.Ok(rows);
        })
        .WithOpenApi();

        // POST crear jugador
        app.MapPost("/api/teams/{teamId:int}/players", async (int teamId, [FromBody] CreatePlayerDto body) =>
        {
            var name = (body?.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name es requerido." });

            using var conn = new SqlConnection(cs());
            try
            {
                var id = await conn.ExecuteScalarAsync<int>(@"
                INSERT INTO MarcadorDB.dbo.Players(TeamId, Number, Name, Position, Active)
                OUTPUT INSERTED.PlayerId
                VALUES(@teamId, @num, @name, @pos, 1);",
                    new { teamId, num = body!.Number, name, pos = body!.Position });
                return Results.Created($"/api/players/{id}", new { playerId = id });
            }
            catch (SqlException ex) when (ex.Number == 2601 || ex.Number == 2627)
            {
                return Results.BadRequest(new { error = "Ese dorsal ya existe en el equipo." });
            }
        })
        .WithOpenApi();

        // PATCH actualizar jugador
        app.MapPatch("/api/players/{playerId:int}", async (int playerId, [FromBody] UpdatePlayerDto body) =>
        {
            using var conn = new SqlConnection(cs());
            var ok = await conn.ExecuteAsync(@"
            UPDATE MarcadorDB.dbo.Players SET
            Number   = COALESCE(@Number, Number),
            Name     = COALESCE(@Name, Name),
            Position = COALESCE(@Position, Position),
            Active   = COALESCE(@Active, Active)
            WHERE PlayerId=@playerId;",
                new { playerId, body?.Number, body?.Name, body?.Position, body?.Active });

            return ok > 0 ? Results.NoContent() : Results.NotFound();
        })
        .WithOpenApi();

        // DELETE jugador
        app.MapDelete("/api/players/{playerId:int}", async (int playerId) =>
        {
            using var conn = new SqlConnection(cs());
            var ok = await conn.ExecuteAsync("DELETE FROM MarcadorDB.dbo.Players WHERE PlayerId=@playerId;", new { playerId });
            return ok > 0 ? Results.NoContent() : Results.NotFound();
        })
        .WithOpenApi();
    
            app.MapGet("/api/games/{id:int}/fouls/summary", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            var teamRows = await conn.QueryAsync(@"
                SELECT Quarter, Team,
                    SUM(CASE WHEN EventType='FOUL' THEN 1 ELSE 0 END) AS Fouls
                FROM MarcadorDB.dbo.GameEvents
                WHERE GameId=@id
                GROUP BY Quarter, Team
                ORDER BY Quarter, Team;", new { id });

            var playerRows = await conn.QueryAsync(@"
                SELECT Quarter, Team, PlayerId,
                    SUM(CASE WHEN EventType='FOUL' THEN 1 ELSE 0 END) AS Fouls
                FROM MarcadorDB.dbo.GameEvents
                WHERE GameId=@id AND PlayerId IS NOT NULL
                GROUP BY Quarter, Team, PlayerId
                ORDER BY Quarter, Team, PlayerId;", new { id });

            return Results.Ok(new { team = teamRows, players = playerRows });
        })
        .WithOpenApi();

// GET: jugadores de un juego por lado (HOME/AWAY)
app.MapGet("/api/games/{id:int}/players/{side}", async (int id, string side) =>
{
    var s = (side ?? "").ToUpperInvariant();
    if (s != "HOME" && s != "AWAY")
        return Results.BadRequest(new { error = "side debe ser HOME o AWAY" });

    using var conn = new SqlConnection(cs());

    // 1) Tomamos ids y nombres
    var g = await conn.QuerySingleOrDefaultAsync<(int? HomeTeamId, int? AwayTeamId, string HomeTeam, string AwayTeam)>(
        @"SELECT HomeTeamId, AwayTeamId, HomeTeam, AwayTeam
          FROM MarcadorDB.dbo.Games WHERE GameId = @id;", new { id });

    if (g.Equals(default)) return Results.NotFound();

    // 2) Elegimos el TeamId del lado pedido
    int? teamId = s == "HOME" ? g.HomeTeamId : g.AwayTeamId;

    // 3) Si no hay TeamId (partidos creados “a mano”), buscamos por nombre para no romper compatibilidad
    if (teamId is null)
    {
        var name = s == "HOME" ? g.HomeTeam : g.AwayTeam;
        teamId = await conn.ExecuteScalarAsync<int?>(
            "SELECT TeamId FROM MarcadorDB.dbo.Teams WHERE Name = @name;", new { name });
        if (teamId is null) return Results.Ok(Array.Empty<object>()); // sin plantilla
    }

    // 4) Devolvemos plantilla ordenada
    var rows = await conn.QueryAsync(@"
        SELECT PlayerId, TeamId, Number, Name, Position, Active, CreatedAt
        FROM MarcadorDB.dbo.Players
        WHERE TeamId=@teamId
        ORDER BY COALESCE(Number,255), Name;", new { teamId });

    return Results.Ok(rows);
})
.WithName("GetGamePlayersBySide")
.WithOpenApi();
    }

}
