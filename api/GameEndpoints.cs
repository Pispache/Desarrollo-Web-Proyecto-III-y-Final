using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

public class AdjustScoreDto
{
    public int HomeDelta { get; set; }
    public int AwayDelta { get; set; }
}

public class ScoreDto
{
    public string Team { get; set; } = "";
    public int Points { get; set; }
    public int? PlayerId { get; set; }
    public int? PlayerNumber { get; set; }
}

public class FoulDto
{
    public string? Team { get; set; }
    public int? PlayerId { get; set; }
    public int? PlayerNumber { get; set; }
    public string? FoulType { get; set; }
    public string? Type { get; set; }
    public string? foul_type { get; set; }
}

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

        static string NormalizeFoulType(string? raw)
        {
            var allowed = new HashSet<string> { "PERSONAL", "TECHNICAL", "UNSPORTSMANLIKE", "DISQUALIFYING" };
            var candidate = raw?.Trim()?.ToUpperInvariant();
            return (!string.IsNullOrEmpty(candidate) && allowed.Contains(candidate)) ? candidate : "PERSONAL";
        }

        // ===== Games =====
        g.MapGet("/games", async () =>
        {
            using var c = Open(cs());
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
            using var c = Open(cs());
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

            // Obtener el estado actual del juego incluyendo puntuación
            var cur = await One<(int Quarter, string Status, int HomeScore, int AwayScore)>(
                c, 
                $"SELECT Quarter, Status, HomeScore, AwayScore FROM {T}Games WHERE GameId=@id;", 
                new { id }, 
                tx);
                
            if (cur == default) { tx.Rollback(); return Results.NotFound(); }
            if (!string.Equals(cur.Status, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
            { 
                tx.Rollback(); 
                return Results.BadRequest(new { error = "El juego debe estar en progreso para avanzar de cuarto." }); 
            }

            // Verificar si es el final del 4to cuarto o tiempo extra
            if (cur.Quarter >= 4)
            {
                // Si hay empate, permitir tiempo extra ilimitado
                if (cur.HomeScore == cur.AwayScore)
                {
                    // Avanzar al siguiente tiempo extra
                    await Exec(c, $"UPDATE {T}Games SET Quarter = Quarter + 1 WHERE GameId=@id;", new { id }, tx);
                    
                    // Configurar el reloj para el tiempo extra (5 minutos por defecto)
                    await Exec(c, $@"
                        UPDATE c SET 
                            QuarterMs = 300000,  -- 5 minutos en milisegundos
                            RemainingMs = 300000,
                            Running = 0, 
                            StartedAt = NULL, 
                            UpdatedAt = SYSUTCDATETIME()
                        FROM {T}GameClocks c 
                        WHERE c.GameId=@id;", new { id }, tx);
                        
                    tx.Commit(); 
                    return Results.Ok(new { 
                        message = "Tiempo extra iniciado", 
                        quarter = cur.Quarter + 1,
                        isOvertime = true
                    });
                }
                else
                {
                    tx.Rollback();
                    return Results.BadRequest(new { 
                        error = "No se puede cambiar de cuarto en tiempo extra con marcador diferente.",
                        homeScore = cur.HomeScore,
                        awayScore = cur.AwayScore
                    });
                }
            }
            else
            {
                // Avance de cuarto normal (1-4)
                await Exec(c, $"UPDATE {T}Games SET Quarter = Quarter + 1 WHERE GameId=@id;", new { id }, tx);
                
                // Reiniciar el reloj para el nuevo cuarto
                await Exec(c, $@"
                    UPDATE c SET 
                        Running = 0, 
                        RemainingMs = QuarterMs, 
                        StartedAt = NULL, 
                        UpdatedAt = SYSUTCDATETIME()
                    FROM {T}GameClocks c 
                    WHERE c.GameId=@id;", new { id }, tx);

                tx.Commit(); 
                return Results.Ok(new { 
                    message = "Siguiente cuarto iniciado", 
                    quarter = cur.Quarter + 1,
                    isOvertime = false
                });
            }
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/previous-quarter", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            // Obtener el estado actual del juego
            var cur = await One<(int Quarter, string Status, int HomeScore, int AwayScore)>(
                c, 
                $"SELECT Quarter, Status, HomeScore, AwayScore FROM {T}Games WHERE GameId=@id;", 
                new { id }, 
                tx);
                
            if (cur == default) { tx.Rollback(); return Results.NotFound(); }
            if (!string.Equals(cur.Status, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
            { 
                tx.Rollback(); 
                return Results.BadRequest(new { error = "El juego debe estar en progreso para retroceder de cuarto." }); 
            }

            // No permitir retroceder del primer cuarto
            if (cur.Quarter <= 1)
            {
                tx.Rollback();
                return Results.BadRequest(new { error = "No se puede retroceder del primer cuarto." });
            }

            // Retroceder al cuarto anterior
            var previousQuarter = cur.Quarter - 1;
            
            // Actualizar el cuarto en la base de datos
            await Exec(c, $"UPDATE {T}Games SET Quarter = @previousQuarter WHERE GameId=@id;", new { id, previousQuarter }, tx);
            
            // Configurar el reloj para el cuarto anterior
            // Para el cuarto normal, usamos 10 minutos, para tiempo extra 5 minutos
            var quarterMs = previousQuarter <= 4 ? 600000 : 300000;
            
            // Actualizar el reloj del cuarto actual
            await Exec(c, $@"
                UPDATE c SET 
                    QuarterMs = @quarterMs,
                    RemainingMs = @quarterMs,
                    Running = 0, 
                    StartedAt = NULL, 
                    UpdatedAt = SYSUTCDATETIME()
                FROM {T}GameClocks c 
                WHERE c.GameId=@id;", 
                new { id, quarterMs }, tx);

            tx.Commit();
            return Results.Ok(new { 
                message = $"Se ha retrocedido al cuarto {previousQuarter}",
                quarter = previousQuarter,
                isOvertime = previousQuarter > 4
            });
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/finish", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            var ok = await Exec(c, $"UPDATE {T}Games SET Status='FINISHED' WHERE GameId=@id AND Status='IN_PROGRESS';", new { id }, tx);
            if (ok == 0) { tx.Rollback(); return Results.BadRequest(new { error = "No se pudo finalizar. El partido no está en progreso o ya ha finalizado." }); }
            await Exec(c, $"UPDATE {T}GameClocks SET Running=0, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME() WHERE GameId=@id;", new { id }, tx);
            tx.Commit(); 
            return Results.NoContent();
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/cancel", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            var ok = await Exec(c, $"UPDATE {T}Games SET Status='CANCELLED' WHERE GameId=@id AND Status IN ('SCHEDULED', 'IN_PROGRESS', 'SUSPENDED');", new { id }, tx);
            if (ok == 0) { tx.Rollback(); return Results.BadRequest(new { error = "No se pudo cancelar. El partido ya está finalizado o cancelado." }); }
            await Exec(c, $"UPDATE {T}GameClocks SET Running=0, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME() WHERE GameId=@id;", new { id }, tx);
            tx.Commit(); 
            return Results.NoContent();
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/suspend", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            var ok = await Exec(c, $"UPDATE {T}Games SET Status='SUSPENDED' WHERE GameId=@id AND Status='IN_PROGRESS';", new { id }, tx);
            if (ok == 0) { tx.Rollback(); return Results.BadRequest(new { error = "No se pudo suspender. El partido debe estar en progreso." }); }
            await Exec(c, $"UPDATE {T}GameClocks SET Running=0, UpdatedAt=SYSUTCDATETIME() WHERE GameId=@id;", new { id }, tx);
            tx.Commit(); 
            return Results.NoContent();
        }).WithOpenApi();
        
        g.MapPost("/games/{id:int}/resume", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            
            // Update game status to IN_PROGRESS if it's SUSPENDED
            var ok = await Exec(c, 
                $"UPDATE {T}Games SET Status='IN_PROGRESS' WHERE GameId=@id AND Status='SUSPENDED';", 
                new { id }, tx);
                
            if (ok == 0) 
            { 
                tx.Rollback(); 
                return Results.BadRequest(new { error = "No se pudo reanudar. El partido debe estar suspendido." }); 
            }
            
            // Update clock - set Running=1 and ensure StartedAt is set if NULL
            await Exec(c, 
                $"UPDATE {T}GameClocks SET " +
                "Running=1, " +
                "StartedAt = CASE WHEN StartedAt IS NULL THEN SYSUTCDATETIME() ELSE StartedAt END, " +
                "UpdatedAt = SYSUTCDATETIME() " +
                "WHERE GameId=@id;", 
                new { id }, tx);
                
            tx.Commit();
            return Results.NoContent();
        }).WithOpenApi();
        
        // ===== Score / Foul / Undo =====
        g.MapPost("/games/{id:int}/score", async (int id, [FromBody] ScoreDto dto) =>
        {
            if (dto is null || dto.Points is not (1 or 2 or 3)) 
                return Results.BadRequest(new { error = "Puntos inválidos. Use 1, 2 o 3." });

            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            
            var game = await One<dynamic>(c,
                $"SELECT Status, Quarter, HomeScore, AwayScore FROM {T}Games WHERE GameId=@id;", 
                new { id }, tx);
            
            if (game is null) { tx.Rollback(); return Results.NotFound(); }
            if (game.Status != "IN_PROGRESS" && game.Status != "SUSPENDED") 
                { tx.Rollback(); return Results.BadRequest(new { error = "El partido debe estar en progreso o suspendido." }); }

            var col = dto.Team == "HOME" ? "HomeScore" : "AwayScore";
            
            await Exec(c, 
                $"UPDATE {T}Games SET {col} = {col} + @points WHERE GameId=@id;", 
                new { id, points = dto.Points }, tx);

            await Exec(c, 
                $"INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerId, PlayerNumber) " +
                "VALUES(@id, @quarter, @team, @eventType, @playerId, @playerNumber);",
                new 
                { 
                    id, 
                    quarter = game.Quarter, 
                    team = dto.Team,
                    eventType = $"POINT_{dto.Points}",
                    playerId = dto.PlayerId,
                    playerNumber = dto.PlayerNumber
                }, tx);

            tx.Commit();
            return Results.NoContent();
        }).WithOpenApi();

        // Endpoint para restar un punto
        g.MapPost("/games/{id:int}/subtract-point", async (int id, [FromBody] ScoreDto dto) =>
        {
            if (dto is null || string.IsNullOrEmpty(dto.Team))
                return Results.BadRequest(new { error = "Datos inválidos." });

            using var c = Open(cs());
            using var tx = c.BeginTransaction();
            
            // Obtener el estado actual del juego
            var game = await One<dynamic>(c,
                $"SELECT Status, Quarter, HomeScore, AwayScore FROM {T}Games WHERE GameId=@id;", 
                new { id }, tx);
            
            if (game is null) { tx.Rollback(); return Results.NotFound(); }
            if (game.Status != "IN_PROGRESS" && game.Status != "SUSPENDED")
                { tx.Rollback(); return Results.BadRequest(new { error = "El partido debe estar en progreso o suspendido." }); }

            // Verificar que el puntaje no sea menor a 0
            var currentScore = dto.Team == "HOME" ? game.HomeScore : game.AwayScore;
            if (currentScore <= 0)
                { tx.Rollback(); return Results.BadRequest(new { error = "El puntaje ya es 0." }); }

            // Actualizar el puntaje
            var col = dto.Team == "HOME" ? "HomeScore" : "AwayScore";
            await Exec(c, 
                $"UPDATE {T}Games SET {col} = {col} - 1 WHERE GameId=@id AND {col} > 0;", 
                new { id }, tx);

            // Registrar el evento
            await Exec(c, 
                $"INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerId, PlayerNumber) " +
                "VALUES(@id, @quarter, @team, @eventType, @playerId, @playerNumber);",
                new 
                { 
                    id, 
                    quarter = game.Quarter, 
                    team = dto.Team,
                    eventType = "POINT_UNDO",
                    playerId = dto.PlayerId,
                    playerNumber = dto.PlayerNumber
                }, tx);

            tx.Commit();
            return Results.NoContent();
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/foul", async (
            int id, 
            [FromBody] FoulDto b,
            [FromQuery(Name = "type")] string? qType,
            [FromQuery(Name = "foulType")] string? qFoulType,
            [FromQuery(Name = "foul_type")] string? qFoulTypeSnake) =>
        {
            var team = (b?.Team ?? "").ToUpperInvariant();
            if (team is not ("HOME" or "AWAY"))
                return Results.BadRequest(new { error = "Equipo inválido. Use HOME o AWAY." });

            using var c = Open(cs());

            // Validar estado del juego
            var st = await One<string>(c, $"SELECT Status FROM {T}Games WHERE GameId=@id;", new { id });
            if (!string.Equals(st, "IN_PROGRESS", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Juego no IN_PROGRESS." });

            // (Opcional) rechazar faltas para jugador ya descalificado
            if (b?.PlayerId is int pidCheck)
            {
                var dqExists = await One<int>(c,
                    $"SELECT COUNT(1) FROM {T}GameEvents WHERE GameId=@id AND PlayerId=@pidCheck AND EventType='DISQUALIFIED';",
                    new { id, pidCheck });
                if (dqExists > 0)
                    return Results.BadRequest(new { error = "Jugador ya descalificado." });
            }
            string? rawFromQuery = qFoulTypeSnake ?? qFoulType ?? qType;
            string? rawFromBody  = b?.FoulType ?? b?.Type ?? b?.foul_type;
            var foulType = NormalizeFoulType(rawFromQuery ?? rawFromBody);

            // Insertar la falta con su tipo
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
                    ftype = foulType
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
                var alreadyDQ = await One<int>(c,
                    $"SELECT COUNT(1) FROM {T}GameEvents WHERE GameId=@id AND PlayerId=@pid AND EventType='DISQUALIFIED';",
                    new { id, pid });

                if (alreadyDQ == 0)
                {
                    await c.ExecuteAsync($@"
                        INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerId, CreatedAt)
                        VALUES(@id, @q, @team, 'DISQUALIFIED', @pid, SYSUTCDATETIME());",
                        new { id, q = quarter, team, pid });
                }
            }
            else if (isFoulOut)
            {
                var alreadyOut = await One<int>(c,
                    $"SELECT COUNT(1) FROM {T}GameEvents WHERE GameId=@id AND PlayerId=@pid AND EventType='FOUL_OUT';",
                    new { id, pid });

                if (alreadyOut == 0)
                {
                    await c.ExecuteAsync($@"
                        INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, PlayerId, CreatedAt)
                        VALUES(@id, @q, @team, 'FOUL_OUT', @pid, SYSUTCDATETIME());",
                        new { id, q = quarter, team, pid });
                }
            }


            return Results.NoContent();
        }).WithOpenApi();

        g.MapPost("/games/{id:int}/undo", async (int id) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            // Obtener el evento más reciente que se puede deshacer
            var query = $"""
                SELECT TOP 1 * FROM {T}GameEvents
                WHERE GameId=@id AND EventType IN ('POINT_1','POINT_2','POINT_3','FOUL','ADJUST')
                ORDER BY EventId DESC;
            """;
            var ev = await c.QuerySingleOrDefaultAsync<dynamic>(query, new { id }, tx);

            if (ev is null) { tx.Rollback(); return Results.BadRequest(new { error = "No hay evento para deshacer." }); }

            // Handle different event types
            switch (((string)ev.EventType).ToUpperInvariant())
            {
                case string et when et.StartsWith("POINT_"):
                    var pts = int.Parse(et.Substring(6));
                    var col = string.Equals((string)ev.Team, "HOME", StringComparison.OrdinalIgnoreCase) ? "HomeScore" : "AwayScore";
                    var pointQuery = @$"
                        UPDATE {T}Games 
                        SET {col} = CASE WHEN {col} >= @pts THEN {col} - @pts ELSE 0 END 
                        WHERE GameId = @id;";
                    
                    var ok = await Exec(c, pointQuery, new { id, pts }, tx);
                    if (ok == 0) 
                    { 
                        tx.Rollback(); 
                        return Results.BadRequest(new { error = "No se pudo ajustar marcador." }); 
                    }
                    break;

                case "ADJUST":
                    // Para eventos ADJUST, aplicamos los deltas negativos
                    var adjustQuery = @$"
                        UPDATE {T}Games 
                        SET HomeScore = CASE WHEN HomeScore + @homeDelta >= 0 THEN HomeScore + @homeDelta ELSE 0 END,
                            AwayScore = CASE WHEN AwayScore + @awayDelta >= 0 THEN AwayScore + @awayDelta ELSE 0 END
                        WHERE GameId = @id;";
                    
                    var adjustOk = await Exec(c, adjustQuery, 
                        new { 
                            id, 
                            homeDelta = -1 * (ev.HomeDelta ?? 0), 
                            awayDelta = -1 * (ev.AwayDelta ?? 0) 
                        }, tx);
                    
                    if (adjustOk == 0) 
                    { 
                        tx.Rollback(); 
                        return Results.BadRequest(new { error = "No se pudo deshacer el ajuste de marcador." }); 
                    }
                    break;

                // FOUL events don't need score adjustment, just remove the event
                case "FOUL":
                    break;
            }

            // Registrar la acción UNDO y eliminar el evento original
            var undoQuery = @$"
                INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType) 
                VALUES(@id, @q, @team, 'UNDO');
                DELETE FROM {T}GameEvents WHERE EventId=@eid;";
                
            await Exec(c, undoQuery, new { 
                id, 
                q = (byte)ev.Quarter, 
                team = (string?)ev.Team, 
                eid = (int)ev.EventId 
            }, tx);

            tx.Commit(); return Results.NoContent();
        }).WithOpenApi();

        // ===== Overtime =====
        g.MapPost("/games/{gameId}/overtime", async (int gameId) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            // Verificar que el juego existe y está en progreso
            var game = await c.QueryFirstOrDefaultAsync<dynamic>(
                $"""
                SELECT g.GameId, g.Status, g.HomeScore, g.AwayScore, g.Quarter, 
                       gc.QuarterMs, gc.RemainingMs, gc.Running
                FROM {T}Games g
                LEFT JOIN {T}GameClocks gc ON g.GameId = gc.GameId AND g.Quarter = gc.Quarter
                WHERE g.GameId = @GameId;
                """, 
                new { GameId = gameId }, 
                tx);

            if (game == null) return Results.NotFound(new { error = "Juego no encontrado." });
            if (game.Status != "IN_PROGRESS") 
                return Results.BadRequest(new { error = "El juego no está en progreso." });
            if (game.HomeScore != game.AwayScore)
                return Results.BadRequest(new { error = "Solo se puede iniciar tiempo extra con empate." });
            if (game.Quarter < 4)
                return Results.BadRequest(new { error = "El tiempo extra solo está permitido después del 4to cuarto." });

            // Verificar si ya hay un tiempo extra en curso
            int nextQuarter = game.Quarter + 1;
            var existingOvertime = await c.QueryFirstOrDefaultAsync<dynamic>(
                $"SELECT 1 FROM {T}GameClocks WHERE GameId = @GameId AND Quarter = @NextQuarter",
                new { GameId = gameId, NextQuarter = nextQuarter }, 
                tx);

            if (existingOvertime != null)
                return Results.BadRequest(new { error = "Ya hay un tiempo extra en curso." });

            // Crear un nuevo tiempo extra (5 minutos)
            int overtimeMs = 5 * 60 * 1000; // 5 minutos en milisegundos
            
            await c.ExecuteAsync(
                $"""
                -- Primero, verificar si ya existe un registro para este cuarto
                IF EXISTS (SELECT 1 FROM {T}GameClocks WHERE GameId = @GameId AND Quarter = @NextQuarter)
                BEGIN
                    -- Actualizar el tiempo extra existente
                    UPDATE {T}GameClocks 
                    SET QuarterMs = @OvertimeMs,
                        RemainingMs = @OvertimeMs,
                        Running = 0,
                        StartedAt = NULL,
                        UpdatedAt = SYSUTCDATETIME()
                    WHERE GameId = @GameId AND Quarter = @NextQuarter;
                END
                ELSE
                BEGIN
                    -- Insertar nuevo registro de tiempo extra
                    INSERT INTO {T}GameClocks (GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt)
                    VALUES (@GameId, @NextQuarter, @OvertimeMs, @OvertimeMs, 0, NULL, SYSUTCDATETIME());
                END

                -- Actualizar el juego al siguiente cuarto
                UPDATE {T}Games 
                SET Quarter = @NextQuarter,
                    Status = 'IN_PROGRESS',
                    CreatedAt = SYSUTCDATETIME()
                WHERE GameId = @GameId;
                """, 
                new { 
                    GameId = gameId, 
                    NextQuarter = nextQuarter, 
                    OvertimeMs = overtimeMs 
                }, 
                tx);

            tx.Commit();
            return Results.Ok(new { 
                success = true, 
                message = "Tiempo extra iniciado correctamente",
                quarter = nextQuarter,
                durationMs = overtimeMs
            });
        }).WithOpenApi();

        // ===== Teams & Players =====
        g.MapGet("/teams", async () =>
        {
            using var c = Open(cs());
            var rows = await c.QueryAsync($"SELECT TeamId, Name, CreatedAt FROM {T}Teams ORDER BY Name;");
            return Results.Ok(rows);
        }).WithOpenApi();

        g.MapPost("/teams", async ([FromBody] TeamCreateDto body) =>
        {
            var name = (body?.Name ?? "").Trim();
            if (IsNullOrWhite(name)) return Results.BadRequest(new { error = "Name requerido." });

            try
            {
                using var c = Open(cs());
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
            using var c = Open(cs());
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
                using var c = Open(cs());
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
            using var c = Open(cs());
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
            using var c = Open(cs());
            var ok = await c.ExecuteAsync($"DELETE FROM {T}Players WHERE PlayerId=@playerId;", new { playerId });
            return ok > 0 ? Results.NoContent() : Results.NotFound();
        }).WithOpenApi();

        // ===== Ajuste directo de puntuación =====
        g.MapPatch("/games/{id:int}/score/adjust", async (int id, [FromBody] AdjustScoreDto dto) =>
        {
            using var c = Open(cs());
            using var tx = c.BeginTransaction();

            // Validar que el juego existe y está en progreso
            var game = await c.QueryFirstOrDefaultAsync<dynamic>(
                $"SELECT Status FROM {T}Games WHERE GameId=@id;", 
                new { id }, transaction: tx);
                
            if (game is null) 
                return Results.NotFound(new { error = "Juego no encontrado." });
                
            if (game.Status != "IN_PROGRESS") 
                return Results.BadRequest(new { error = "El juego no está en progreso." });

            // Actualizar puntuación
            var updateSql = @$"
                UPDATE {T}Games SET 
                    HomeScore = CASE WHEN (HomeScore + @homeDelta) >= 0 THEN HomeScore + @homeDelta ELSE 0 END,
                    AwayScore = CASE WHEN (AwayScore + @awayDelta) >= 0 THEN AwayScore + @awayDelta ELSE 0 END
                WHERE GameId = @id;";

            await c.ExecuteAsync(updateSql, new { id, homeDelta = dto.HomeDelta, awayDelta = dto.AwayDelta }, transaction: tx);

            // Registrar evento de ajuste
            var quarter = await c.QueryFirstOrDefaultAsync<byte>(
                $"SELECT Quarter FROM {T}Games WHERE GameId=@id;", 
                new { id }, transaction: tx);
            
            await c.ExecuteAsync(
                $"""
                INSERT INTO {T}GameEvents(GameId, Quarter, Team, EventType, CreatedAt, FoulType)
                VALUES (@id, @quarter, 'SYSTEM', 'ADJUST', SYSUTCDATETIME(), 'SCORE_ADJUST');
                """, 
                new { id, quarter }, transaction: tx);

            tx.Commit();
            return Results.NoContent();
        }).WithOpenApi();

        // ===== Rosters por juego y resumen de faltas =====
        g.MapGet("/games/{id:int}/players/{side}", async (int id, string side) =>
        {
            var s = (side ?? "").ToUpperInvariant();
            if (s is not ("HOME" or "AWAY")) return Results.BadRequest(new { error = "side HOME/AWAY" });

            using var c = Open(cs());
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
            using var c = Open(cs());
            var team = await c.QueryAsync($@"
                SELECT Quarter, Team, COALESCE(FoulType,'PERSONAL') AS FoulType,
                    COUNT(*) AS Fouls
                FROM {T}GameEvents
                WHERE GameId=@id AND EventType='FOUL'
                GROUP BY Quarter, Team, COALESCE(FoulType,'PERSONAL')
                ORDER BY Quarter, Team, FoulType;", new { id });

            var players = await c.QueryAsync($@"
                SELECT 
                    e.Quarter, 
                    e.Team, 
                    e.PlayerId,
                    p.Name AS PlayerName,
                    p.Number AS PlayerNumber,
                    COALESCE(e.FoulType,'PERSONAL') AS FoulType,
                    COUNT(*) AS Fouls
                FROM {T}GameEvents e
                LEFT JOIN dbo.Players p ON e.PlayerId = p.PlayerId
                WHERE e.GameId=@id AND e.EventType='FOUL' AND e.PlayerId IS NOT NULL
                GROUP BY e.Quarter, e.Team, e.PlayerId, p.Name, p.Number, COALESCE(e.FoulType,'PERSONAL')
                ORDER BY e.Quarter, e.Team, e.PlayerId, FoulType;", new { id });

            return Results.Ok(new { team, players });
        }).WithOpenApi();

        // ===== Reset Global =====
        g.MapPost("/games/{id:int}/reset-all", async (int id) =>
        {
            using var c = Open(cs());
            
            try 
            {
                // Verificar si el juego existe
                var gameExists = await c.ExecuteScalarAsync<int>(
                    $"SELECT 1 FROM {T}Games WHERE GameId = @id", 
                    new { id });
                    
                if (gameExists != 1)
                    return Results.Problem("El partido no existe", statusCode: 404);
                
                using var tx = c.BeginTransaction();
                
                try 
                {
                    // 1. Registrar evento de reinicio
                    await c.ExecuteAsync(
                        $"INSERT INTO {T}GameEvents (GameId, Quarter, Team, EventType, CreatedAt) " +
                        "VALUES (@id, 1, 'SYSTEM', 'RESET', SYSUTCDATETIME())", 
                        new { id }, tx);

                    // 2. Resetear marcador
                    await c.ExecuteAsync(
                        $"UPDATE {T}Games SET HomeScore=0, AwayScore=0, Quarter=1, Status='IN_PROGRESS' " +
                        "WHERE GameId=@id", 
                        new { id }, tx);

                    // 3. Resetear reloj
                    // Primero eliminamos todos los registros existentes para este juego
                    await c.ExecuteAsync(
                        $"DELETE FROM {T}GameClocks WHERE GameId = @id", 
                        new { id }, tx);
                        
                    // Luego insertamos un nuevo registro para el primer cuarto
                    await c.ExecuteAsync(
                        $"INSERT INTO {T}GameClocks (GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt) " +
                        "VALUES (@id, 1, 600000, 600000, 0, NULL, SYSUTCDATETIME())", 
                        new { id }, tx);

                    tx.Commit();
                    return Results.NoContent();
                }
                catch (Exception ex)
                {
                    tx.Rollback();
                    return Results.Problem($"Error en transacción: {ex.Message}", statusCode: 500);
                }
            }
            catch (Exception ex)
            {
                return Results.Problem($"Error general: {ex.Message}", statusCode: 500);
            }
        }).WithOpenApi();
    }
}
