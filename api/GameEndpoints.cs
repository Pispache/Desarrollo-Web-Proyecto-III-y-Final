using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

public static class GameEndpoints
{
    const string T = "MarcadorDB.dbo."; // prefijo schema

    public static void MapGameEndpoints(this WebApplication app, Func<string> cs)
    {
        var g = app.MapGroup("/api");

        // ===== Helpers mínimos =====
        static SqlConnection Open(string cs) { var c = new SqlConnection(cs); c.Open(); return c; }
        static Task<T> One<T>(SqlConnection c, string sql, object? p = null, SqlTransaction? tx = null)
            => c.QuerySingleOrDefaultAsync<T>(sql, p, tx);
        static Task<int> Exec(SqlConnection c, string sql, object? p = null, SqlTransaction? tx = null)
            => c.ExecuteAsync(sql, p, tx);
        static bool IsNullOrWhite(string? s) => string.IsNullOrWhiteSpace(s);

        // ===== Games =====
        g.MapGet("/games", async () =>
        {
            using var c = new SqlConnection(cs());
            var rows = await c.QueryAsync($"SELECT TOP 50 * FROM {T}Games ORDER BY GameId DESC;");
            return Results.Ok(rows);
        }).WithOpenApi();

        g.MapPost("/games", async ([FromBody] CreateGameDto body) =>
        {
            var home = IsNullOrWhite(body?.Home) ? "Local" : body!.Home!.Trim();
            var away = IsNullOrWhite(body?.Away) ? "Visitante" : body!.Away!.Trim();

            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            var id = await c.ExecuteScalarAsync<int>(
                $@"INSERT INTO {T}Games(HomeTeam, AwayTeam, Status, Quarter, CreatedAt)
                   OUTPUT INSERTED.GameId VALUES(@home, @away, 'SCHEDULED', 1, SYSUTCDATETIME());",
                new { home, away }, tx);

            await Exec(c,
                $@"IF NOT EXISTS(SELECT 1 FROM {T}GameClocks WHERE GameId=@id)
                   INSERT INTO {T}GameClocks(GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt)
                   VALUES(@id, 1, 600000, 600000, 0, NULL, SYSUTCDATETIME());",
                new { id }, tx);

            tx.Commit();
            return Results.Created($"/api/games/{id}", new { gameId = id, home, away });
        }).WithOpenApi();

        g.MapGet("/games/{id:int}", async (int id) =>
        {
            using var c = new SqlConnection(cs());
            var game = await One<dynamic>(c, $"SELECT * FROM {T}Games WHERE GameId=@id;", new { id });
            if (game is null) return Results.NotFound();
            var events = await c.QueryAsync($"SELECT TOP 100 * FROM {T}GameEvents WHERE GameId=@id ORDER BY EventId DESC;", new { id });
            return Results.Ok(new { game, events });
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/start", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            var ok = await Exec(c, $"UPDATE {T}Games SET Status='IN_PROGRESS' WHERE GameId=@id AND Status='SCHEDULED';", new { id }, tx);
            if (ok == 0) { tx.Rollback(); return Results.BadRequest(new { error = "No se pudo iniciar." }); }

            await Exec(c, $"UPDATE {T}GameClocks SET Running=1, StartedAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME() WHERE GameId=@id;", new { id }, tx);
            tx.Commit();
            return Results.NoContent();
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/advance-quarter", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            var cur = await One<(int Quarter, string Status)>(c, $"SELECT Quarter, Status FROM {T}Games WHERE GameId=@id;", new { id }, tx);
            if (cur == default) { tx.Rollback(); return Results.NotFound(); }
            if (!string.Equals(cur.Status, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
            { tx.Rollback(); return Results.BadRequest(new { error = "Juego no está IN_PROGRESS." }); }
            if (cur.Quarter >= 4) { tx.Rollback(); return Results.BadRequest(new { error = "Último cuarto." }); }

            await Exec(c, $"UPDATE {T}Games SET Quarter = Quarter + 1 WHERE GameId=@id;", new { id }, tx);
            await Exec(c, $@"
                UPDATE c SET Running=0, RemainingMs=QuarterMs, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME()
                FROM {T}GameClocks c WHERE c.GameId=@id;", new { id }, tx);

            tx.Commit(); return Results.NoContent();
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/finish", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            var ok = await Exec(c, $"UPDATE {T}Games SET Status='FINISHED' WHERE GameId=@id AND Status='IN_PROGRESS';", new { id }, tx);
            if (ok == 0) { tx.Rollback(); return Results.BadRequest(new { error = "No se pudo finalizar." }); }
            await Exec(c, $"UPDATE {T}GameClocks SET Running=0, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME() WHERE GameId=@id;", new { id }, tx);
            tx.Commit(); return Results.NoContent();
        }).WithOpenApi();

        // ===== Score / Foul / Undo =====
        g.MapPost("/games/{id:int}/score", async (int id, [FromBody] ScoreDto b) =>
        {
            var team = (b?.Team ?? "").ToUpperInvariant();
            if ((team != "HOME" && team != "AWAY") || (b?.Points is not (1 or 2 or 3)))
                return Results.BadRequest(new { error = "Team HOME/AWAY y Points 1|2|3." });

            using var c = new SqlConnection(cs());
            var st = await One<string>(c, $"SELECT Status FROM {T}Games WHERE GameId=@id;", new { id });
            if (!string.Equals(st, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Juego no IN_PROGRESS." });

            var setScore = team == "HOME"
                ? $"UPDATE {T}Games SET HomeScore = HomeScore + @pts WHERE GameId=@id;"
                : $"UPDATE {T}Games SET AwayScore = AwayScore + @pts WHERE GameId=@id;";

            var sql = $@"
                {setScore}
                INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerNumber, PlayerId)
                SELECT @id, Quarter, @team, @etype, @pnum, @pid FROM {T}Games WHERE GameId=@id;";

            var ok = await c.ExecuteAsync(sql, new
            {
                id,
                team,
                pts = b!.Points,
                etype = $"POINT_{b.Points}",
                pnum = b.PlayerNumber,
                pid = b.PlayerId
            });
            return ok > 0 ? Results.NoContent() : Results.BadRequest(new { error = "No se pudo registrar." });
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/foul", async (int id, [FromBody] FoulDto b) =>
        {
            var team = (b?.Team ?? "").ToUpperInvariant();
            if (team is not ("HOME" or "AWAY"))
                return Results.BadRequest(new { error = "Team HOME/AWAY." });

            using var c = new SqlConnection(cs());

            // Validar estado del juego
            var st = await One<string>(c, $"SELECT Status FROM {T}Games WHERE GameId=@id;", new { id });
            if (!string.Equals(st, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Juego no IN_PROGRESS." });

            // Insertar la falta con su tipo (PERSONAL/TECHNICAL/UNSPORTSMANLIKE/DISQUALIFYING)
            var inserted = await c.ExecuteAsync($@"
                INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerNumber, PlayerId, FoulType, CreatedAt)
                SELECT @id, Quarter, @team, 'FOUL', @pnum, @pid, @ftype, SYSUTCDATETIME()
                FROM {T}Games WHERE GameId=@id;",
                new
                {
                    id,
                    team,
                    pnum = b?.PlayerNumber,
                    pid  = b?.PlayerId,
                    ftype = (b?.FoulType ?? FoulType.PERSONAL).ToString()
                });

            if (inserted == 0)
                return Results.BadRequest(new { error = "No se pudo registrar." });

            // Si no hay jugador asociado, terminamos (la falta suma a equipo igualmente)
            if (b?.PlayerId is null)
                return Results.NoContent();

            var pid = b.PlayerId.Value;

            // Recuento por tipo para el jugador (PERSONAL/T/U/D)
            var byType = await c.QueryAsync<(string FoulType, int Cnt)>($@"
                SELECT COALESCE(FoulType,'PERSONAL') AS FoulType, COUNT(*) AS Cnt
                FROM {T}GameEvents
                WHERE GameId=@id AND EventType='FOUL' AND PlayerId=@pid
                GROUP BY COALESCE(FoulType,'PERSONAL');",
                new { id, pid });

            int personals = 0, tech = 0, uns = 0, disq = 0;
            foreach (var (ft, cnt) in byType)
            {
                switch ((ft ?? "PERSONAL").ToUpperInvariant())
                {
                    case "TECHNICAL":        tech = cnt; break;
                    case "UNSPORTSMANLIKE":  uns  = cnt; break;
                    case "DISQUALIFYING":    disq = cnt; break;
                    default:                 personals = cnt; break; // PERSONAL o null
                }
            }

            // Lógica FIBA de descalificación
            bool isDQ = false;
            string? reason = null;

            // D directo
            if (disq >= 1) { isDQ = true; reason = "DISQUALIFYING (D)"; }
            // 2T, 2U, T+U
            else if (tech >= 2)           { isDQ = true; reason = "2 TECHNICAL (T+T)"; }
            else if (uns  >= 2)           { isDQ = true; reason = "2 UNSPORTSMANLIKE (U+U)"; }
            else if (tech >= 1 && uns>=1) { isDQ = true; reason = "T + U"; }

            // Foul out por acumulación (cuentan P + T + U + D)
            int totalPersonalsLike = personals + tech + uns + disq;
            bool isFoulOut = totalPersonalsLike >= 5;

            // Obtener quarter actual para el evento complementario
            var quarter = await One<int>(c, $"SELECT Quarter FROM {T}Games WHERE GameId=@id;", new { id });

            if (isDQ)
            {
                await c.ExecuteAsync($@"
                    INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerId, CreatedAt, Note)
                    VALUES(@id, @q, @team, 'DISQUALIFIED', @pid, SYSUTCDATETIME(), @why);",
                    new { id, q = quarter, team, pid, why = reason });
            }
            else if (isFoulOut)
            {
                await c.ExecuteAsync($@"
                    INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerId, CreatedAt)
                    VALUES(@id, @q, @team, 'FOUL_OUT', @pid, SYSUTCDATETIME());",
                    new { id, q = quarter, team, pid });
            }

            return Results.NoContent();
        }).WithOpenApi();


        g.MapPost("/games/{id:int}/undo", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            var ev = await c.QuerySingleOrDefaultAsync<dynamic>(
                $@"SELECT TOP 1 * FROM {T}GameEvents
                   WHERE GameId=@id AND EventType IN ('POINT_1','POINT_2','POINT_3','FOUL')
                   ORDER BY EventId DESC;", new { id }, tx);

            if (ev is null) { tx.Rollback(); return Results.BadRequest(new { error = "No hay evento." }); }

            if (((string)ev.EventType).StartsWith("POINT_"))
            {
                var pts = int.Parse(((string)ev.EventType).Substring(6));
                var col = string.Equals((string)ev.Team, "HOME", StringComparison.OrdinalIgnoreCase) ? "HomeScore" : "AwayScore";
                var ok = await Exec(c, $"UPDATE {T}Games SET {col} = CASE WHEN {col}>=@pts THEN {col}-@pts ELSE {col} END WHERE GameId=@id;",
                    new { id, pts }, tx);
                if (ok == 0) { tx.Rollback(); return Results.BadRequest(new { error = "No se pudo ajustar marcador." }); }
            }

            await Exec(c,
                $@"INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType) VALUES(@id, @q, @team, 'UNDO');
                   DELETE FROM {T}GameEvents WHERE EventId=@eid;",
                new { id, q = (byte)ev.Quarter, team = (string?)ev.Team, eid = (int)ev.EventId }, tx);

            tx.Commit(); return Results.NoContent();
        }).WithOpenApi();

        // ===== Teams & Players =====
        g.MapGet("/teams", async () =>
        {
            using var c = new SqlConnection(cs());
            var rows = await c.QueryAsync($"SELECT TeamId, Name, CreatedAt FROM {T}Teams ORDER BY Name;");
            return Results.Ok(rows);
        }).WithOpenApi();

        g.MapPost("/teams", async ([FromBody] TeamCreateDto body) =>
        {
            var name = (body?.Name ?? "").Trim();
            if (IsNullOrWhite(name)) return Results.BadRequest(new { error = "Name requerido." });

            try
            {
                using var c = new SqlConnection(cs());
                var id = await c.ExecuteScalarAsync<int>($"INSERT INTO {T}Teams(Name) OUTPUT INSERTED.TeamId VALUES(@name);", new { name });
                return Results.Created($"/api/teams/{id}", new { teamId = id, name });
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627) { return Results.Conflict(new { error = "Nombre duplicado." }); }
        }).WithOpenApi();

        g.MapPost("/games/pair", async ([FromBody] PairDto body) =>
        {
            if (body.HomeTeamId <= 0 || body.AwayTeamId <= 0 || body.HomeTeamId == body.AwayTeamId)
                return Results.BadRequest(new { error = "Equipos inválidos." });

            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            var teams = (await c.QueryAsync<(int TeamId, string Name)>(
                $"SELECT TeamId, Name FROM {T}Teams WHERE TeamId IN (@h,@a);",
                new { h = body.HomeTeamId, a = body.AwayTeamId }, tx)).AsList();

            var home = teams.Find(t => t.TeamId == body.HomeTeamId).Name;
            var away = teams.Find(t => t.TeamId == body.AwayTeamId).Name;
            if (string.IsNullOrEmpty(home) || string.IsNullOrEmpty(away))
            { tx.Rollback(); return Results.BadRequest(new { error = "Equipo no encontrado." }); }

            var id = await c.ExecuteScalarAsync<int>(
                $@"INSERT INTO {T}Games(HomeTeam, AwayTeam, HomeTeamId, AwayTeamId, Status, Quarter, CreatedAt)
                   OUTPUT INSERTED.GameId
                   VALUES(@home, @away, @hid, @aid, 'SCHEDULED', 1, SYSUTCDATETIME());",
                new { home, away, hid = body.HomeTeamId, aid = body.AwayTeamId }, tx);

            await Exec(c,
                $@"INSERT INTO {T}GameClocks(GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt)
                   VALUES(@id, 1, 600000, 600000, 0, NULL, SYSUTCDATETIME());",
                new { id }, tx);

            tx.Commit();
            return Results.Created($"/api/games/{id}", new { gameId = id, home, away });
        }).WithOpenApi();

        g.MapGet("/teams/{teamId:int}/players", async (int teamId) =>
        {
            using var c = new SqlConnection(cs());
            var rows = await c.QueryAsync($@"
                SELECT PlayerId, TeamId, Number, Name, Position, Active, CreatedAt
                FROM {T}Players WHERE TeamId=@teamId
                ORDER BY COALESCE(Number,255), Name;", new { teamId });
            return Results.Ok(rows);
        }).WithOpenApi();

        g.MapPost("/teams/{teamId:int}/players", async (int teamId, [FromBody] CreatePlayerDto body) =>
        {
            var name = (body?.Name ?? "").Trim();
            if (IsNullOrWhite(name)) return Results.BadRequest(new { error = "Name requerido." });

            try
            {
                using var c = new SqlConnection(cs());
                var id = await c.ExecuteScalarAsync<int>($@"
                    INSERT INTO {T}Players(TeamId, Number, Name, Position, Active)
                    OUTPUT INSERTED.PlayerId VALUES(@teamId,@num,@name,@pos,1);",
                    new { teamId, num = body!.Number, name, pos = body!.Position });
                return Results.Created($"/api/players/{id}", new { playerId = id });
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627) { return Results.BadRequest(new { error = "Dorsal duplicado." }); }
        }).WithOpenApi();

        g.MapPatch("/players/{playerId:int}", async (int playerId, [FromBody] UpdatePlayerDto b) =>
        {
            using var c = new SqlConnection(cs());
            var ok = await c.ExecuteAsync($@"
                UPDATE {T}Players SET
                  Number=COALESCE(@Number,Number),
                  Name=COALESCE(@Name,Name),
                  Position=COALESCE(@Position,Position),
                  Active=COALESCE(@Active,Active)
                WHERE PlayerId=@playerId;", new { playerId, b?.Number, b?.Name, b?.Position, b?.Active });
            return ok > 0 ? Results.NoContent() : Results.NotFound();
        }).WithOpenApi();

        g.MapDelete("/players/{playerId:int}", async (int playerId) =>
        {
            using var c = new SqlConnection(cs());
            var ok = await c.ExecuteAsync($"DELETE FROM {T}Players WHERE PlayerId=@playerId;", new { playerId });
            return ok > 0 ? Results.NoContent() : Results.NotFound();
        }).WithOpenApi();

        // ===== Rosters por juego y resumen de faltas =====
        g.MapGet("/games/{id:int}/players/{side}", async (int id, string side) =>
        {
            var s = (side ?? "").ToUpperInvariant();
            if (s is not ("HOME" or "AWAY")) return Results.BadRequest(new { error = "side HOME/AWAY" });

            using var c = new SqlConnection(cs());
            var gRow = await One<(int? HomeTeamId, int? AwayTeamId, string HomeTeam, string AwayTeam)>(
                c, $"SELECT HomeTeamId, AwayTeamId, HomeTeam, AwayTeam FROM {T}Games WHERE GameId=@id;", new { id });

            if (gRow.Equals(default)) return Results.NotFound();

            int? teamId = s == "HOME" ? gRow.HomeTeamId : gRow.AwayTeamId;
            if (teamId is null)
            {
                var name = s == "HOME" ? gRow.HomeTeam : gRow.AwayTeam;
                teamId = await c.ExecuteScalarAsync<int?>($"SELECT TeamId FROM {T}Teams WHERE Name=@name;", new { name });
                if (teamId is null) return Results.Ok(Array.Empty<object>());
            }

            var rows = await c.QueryAsync($@"
                SELECT PlayerId, TeamId, Number, Name, Position, Active, CreatedAt
                FROM {T}Players WHERE TeamId=@teamId
                ORDER BY COALESCE(Number,255), Name;", new { teamId });
            return Results.Ok(rows);
        }).WithOpenApi();

        g.MapGet("/games/{id:int}/fouls/summary", async (int id) =>
        {
            using var c = new SqlConnection(cs());
            var team = await c.QueryAsync($@"
                SELECT Quarter, Team, COALESCE(FoulType,'PERSONAL') AS FoulType,
                    COUNT(*) AS Fouls
                FROM {T}GameEvents
                WHERE GameId=@id AND EventType='FOUL'
                GROUP BY Quarter, Team, COALESCE(FoulType,'PERSONAL')
                ORDER BY Quarter, Team, FoulType;", new { id });

            var players = await c.QueryAsync($@"
                SELECT Quarter, Team, PlayerId, COALESCE(FoulType,'PERSONAL') AS FoulType,
                    COUNT(*) AS Fouls
                FROM {T}GameEvents
                WHERE GameId=@id AND EventType='FOUL' AND PlayerId IS NOT NULL
                GROUP BY Quarter, Team, PlayerId, COALESCE(FoulType,'PERSONAL')
                ORDER BY Quarter, Team, PlayerId, FoulType;", new { id });

            return Results.Ok(new { team, players });
        }).WithOpenApi();

    }

    
}