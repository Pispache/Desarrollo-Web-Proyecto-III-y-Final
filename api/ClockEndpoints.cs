using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

public class ClockDurationDto
{
    public int Minutes { get; set; }
}

public static class ClockEndpoints
{
    const string T = "MarcadorDB.dbo.";

    public static void MapClockEndpoints(this WebApplication app, Func<string> cs)
    {
        // helpers mínimos
        static Task<int> Exec(SqlConnection c, string sql, object p) => c.ExecuteAsync(sql, p);

        // GET estado (remaining computed en SQL)
        app.MapGet("/api/games/{id:int}/clock", async (int id) =>
        {
            using var c = new SqlConnection(cs());
            var dto = await c.QuerySingleOrDefaultAsync($@"
                SELECT GameId, Quarter, QuarterMs, Running, StartedAt, UpdatedAt,
                       RemainingMs = CASE
                         WHEN Running=1 AND StartedAt IS NOT NULL THEN
                           CASE WHEN RemainingMs - DATEDIFF(ms, StartedAt, SYSUTCDATETIME()) > 0
                                THEN RemainingMs - DATEDIFF(ms, StartedAt, SYSUTCDATETIME())
                                ELSE 0 END
                         ELSE RemainingMs
                       END
                FROM {T}GameClocks WHERE GameId=@id;", new { id });

            if (dto is null) return Results.NotFound();

            int rem = Convert.ToInt32(dto.RemainingMs);
            bool running = Convert.ToInt32(dto.Running) != 0 && rem > 0;

            return Results.Ok(new
            {
                gameId = Convert.ToInt32(dto.GameId),
                quarter = Convert.ToByte(dto.Quarter),
                quarterMs = Convert.ToInt32(dto.QuarterMs),
                running,
                remainingMs = rem,
                updatedAt = (DateTime)dto.UpdatedAt
            });
        }).WithOpenApi();

        // POST set duration
        app.MapPost("/api/games/{id:int}/clock/duration", async (int id, [FromBody] ClockDurationDto dto) =>
        {
            if (dto == null || dto.Minutes <= 0)
                return Results.BadRequest("Se requiere una duración válida en minutos");

            using var c = new SqlConnection(cs());
            var ok = await Exec(c, @$"
                UPDATE {T}GameClocks SET
                    QuarterMs = @quarterMs,
                    RemainingMs = @quarterMs,
                    UpdatedAt = SYSUTCDATETIME()
                WHERE GameId = @id;", new { id, quarterMs = dto.Minutes * 60 * 1000 });

            return ok > 0 ? Results.Ok() : Results.NotFound();
        }).WithOpenApi();

        // POST start (idempotente)
        app.MapPost("/api/games/{id:int}/clock/start", async (int id) =>
        {
            using var c = new SqlConnection(cs());
            var ok = await Exec(c, $@"
                UPDATE {T}GameClocks SET
                  Running = 1,
                  StartedAt = CASE WHEN Running=1 AND StartedAt IS NOT NULL THEN StartedAt ELSE SYSUTCDATETIME() END,
                  UpdatedAt = SYSUTCDATETIME()
                WHERE GameId=@id AND RemainingMs > 0;", new { id });
            return ok > 0 ? Results.NoContent() : Results.BadRequest(new { error = "No se pudo iniciar." });
        }).WithOpenApi();

        // POST pause
        app.MapPost("/api/games/{id:int}/clock/pause", async (int id) =>
        {
            using var c = new SqlConnection(cs());
            var ok = await Exec(c, $@"
                UPDATE {T}GameClocks SET
                  RemainingMs = CASE
                    WHEN Running=1 AND StartedAt IS NOT NULL THEN
                      CASE WHEN RemainingMs - DATEDIFF(ms, StartedAt, SYSUTCDATETIME()) > 0
                           THEN RemainingMs - DATEDIFF(ms, StartedAt, SYSUTCDATETIME())
                           ELSE 0 END
                    ELSE RemainingMs END,
                  Running=0, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME()
                WHERE GameId=@id;", new { id });
            return ok > 0 ? Results.NoContent() : Results.NotFound();
        }).WithOpenApi();

        // POST reset (quarterMs opcional)
        app.MapPost("/api/games/{id:int}/clock/reset", async (int id, [FromBody] ClockResetDto? b) =>
        {
            using var c = new SqlConnection(cs());
            var ok = await Exec(c, $@"
                UPDATE {T}GameClocks SET
                  QuarterMs = COALESCE(@qms, QuarterMs),
                  RemainingMs = COALESCE(@qms, QuarterMs),
                  Running=0, StartedAt=NULL, UpdatedAt=SYSUTCDATETIME()
                WHERE GameId=@id;", new { id, qms = b?.QuarterMs });
            return ok > 0 ? Results.NoContent() : Results.NotFound();
        }).WithOpenApi();
    }
}