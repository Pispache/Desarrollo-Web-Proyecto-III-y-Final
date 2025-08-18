using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

public static class ClockEndpoints
{
    public static void MapClockEndpoints(this WebApplication app, Func<string> cs)
    {
        // GET: estado de reloj (computado en SQL)
        app.MapGet("/api/games/{id:int}/clock", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            var dto = await conn.QuerySingleOrDefaultAsync(@"
                SELECT
                    GameId,
                    Quarter,
                    QuarterMs,
                    Running,
                    StartedAt,
                    UpdatedAt,
                    RemainingMs = CASE
                        WHEN Running = 1 AND StartedAt IS NOT NULL THEN
                            CASE
                                WHEN RemainingMs - DATEDIFF(millisecond, StartedAt, SYSUTCDATETIME()) > 0
                                    THEN RemainingMs - DATEDIFF(millisecond, StartedAt, SYSUTCDATETIME())
                                ELSE 0
                            END
                        ELSE RemainingMs
                    END
                FROM MarcadorDB.dbo.GameClocks
                WHERE GameId = @id;
            ", new { id });

            if (dto is null) return Results.NotFound();

            // running efectivo (si ya llegó a 0, lo reportamos como detenido)
            bool running = (dto.Running == true || dto.Running == 1) && ((int)dto.RemainingMs > 0);

            return Results.Ok(new
            {
                gameId = (int)dto.GameId,
                quarter = (byte)dto.Quarter,
                quarterMs = (int)dto.QuarterMs,
                running = running,
                remainingMs = (int)dto.RemainingMs,
                updatedAt = (DateTime)dto.UpdatedAt
            });
        })
        .WithName("GetClock")
        .WithOpenApi();


        // POST: pausa reloj
        app.MapPost("/api/games/{id:int}/clock/pause", async (int id) =>
        {
            using var conn = new SqlConnection(cs());
            var ok = await conn.ExecuteAsync(@"
                UPDATE MarcadorDB.dbo.GameClocks
                SET RemainingMs = CASE
                      WHEN Running=1 AND StartedAt IS NOT NULL
                           THEN CASE WHEN RemainingMs - DATEDIFF(millisecond, StartedAt, SYSUTCDATETIME()) > 0
                                     THEN RemainingMs - DATEDIFF(millisecond, StartedAt, SYSUTCDATETIME())
                                     ELSE 0 END
                      ELSE RemainingMs
                    END,
                    Running=0,
                    StartedAt=NULL,
                    UpdatedAt=SYSUTCDATETIME()
                WHERE GameId=@id;
            ", new { id });

            return ok > 0 ? Results.NoContent() : Results.NotFound();
        })
        .WithName("PauseClock")
        .WithOpenApi();

            // POST: iniciar/reanudar reloj (no falla si ya estaba corriendo)
            app.MapPost("/api/games/{id:int}/clock/start", async (int id) =>
            {
                using var conn = new SqlConnection(cs());
                var ok = await conn.ExecuteAsync(@"
                    UPDATE MarcadorDB.dbo.GameClocks
                    SET Running = 1,
                        StartedAt = CASE WHEN Running = 1 AND StartedAt IS NOT NULL
                                        THEN StartedAt  -- ya estaba corriendo; preserva el arranque original
                                        ELSE SYSUTCDATETIME() END,
                        UpdatedAt = SYSUTCDATETIME()
                    WHERE GameId = @id AND RemainingMs > 0;
                ", new { id });

                return ok > 0 ? Results.NoContent()
                            : Results.BadRequest(new { error = "No se pudo iniciar (¿RemainingMs=0 o no existe?)." });
            })
            .WithName("StartClock")
            .WithOpenApi();

        // POST: reset reloj (opcional quarterMs en body)
        app.MapPost("/api/games/{id:int}/clock/reset", async (int id, [FromBody] ClockResetDto? body) =>
        {
            int? qms = body?.QuarterMs;
            using var conn = new SqlConnection(cs());
            var ok = await conn.ExecuteAsync(@"
                UPDATE MarcadorDB.dbo.GameClocks
                SET QuarterMs = COALESCE(@qms, QuarterMs),
                    RemainingMs = COALESCE(@qms, QuarterMs),
                    Running=0,
                    StartedAt=NULL,
                    UpdatedAt=SYSUTCDATETIME()
                WHERE GameId=@id;
            ", new { id, qms });

            return ok > 0 ? Results.NoContent() : Results.NotFound();
        })
        .WithName("ResetClock")
        .WithOpenApi();
    }
}
