using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

/// <summary>
/// Datos para establecer la duración del reloj de juego, el cuarto
/// </summary>
/// <remarks>
/// Permite definir la cantidad de minutos que durará el período actual.
/// </remarks>
public class ClockDurationDto
{
    /// <summary>Cantidad de minutos para el cuarto o período.</summary>
    public int Minutes { get; set; }
}

/// <summary>
/// Endpoints relacionados con el control del reloj de los juegos.
/// </summary>
/// <remarks>
/// Este módulo gestiona el tiempo de los partidos:  
/// - Consulta del estado actual del reloj (tiempo restante y ejecución).  
/// - Configuración de la duración del cuarto.  
/// - Control para iniciar, pausar y reiniciar el cronómetro.  
///
/// Se basa en SQL Server y Dapper para actualizar el estado del reloj en la base de datos.  
/// Todos los endpoints están protegidos con la política de autorización <c>ADMIN_OR_USER</c>.
/// </remarks>
public static class ClockEndpoints
{
    /// <summary>
    /// Prefijo de esquema y base de datos usado en las consultas SQL.
    /// </summary>
    private const string T = "MarcadorDB.dbo.";

    /// <summary>
    /// Registra los endpoints para controlar el reloj de juego.
    /// </summary>
    /// <param name="app">Aplicación web donde se mapean las rutas.</param>
    /// <param name="cs">Función que devuelve la cadena de conexión a la base de datos.</param>
    /// <remarks>
    /// Rutas principales:  
    /// - <c>GET /api/games/{id}/clock</c>: consulta el estado del reloj.  
    /// - <c>POST /api/games/{id}/clock/duration</c>: define la duración del cuarto.  
    /// - <c>POST /api/games/{id}/clock/start</c>: inicia o reanuda el cronómetro.  
    /// - <c>POST /api/games/{id}/clock/pause</c>: pausa el cronómetro.  
    /// - <c>POST /api/games/{id}/clock/reset</c>: reinicia el cronómetro (con duración opcional).  
    ///
    /// Las respuestas devuelven datos como el tiempo restante, estado de ejecución y actualizaciones del reloj.
    /// </remarks>
    public static void MapClockEndpoints(this WebApplication app, Func<string> cs)
    {
        // helpers mínimos
        static Task<int> Exec(SqlConnection c, string sql, object p) => c.ExecuteAsync(sql, p);

        // GET estado (remaining computed en SQL)
        app.MapGet("/api/games/{id:int}/clock", async (int id) =>
        {
            using var c = new SqlConnection(cs());
            var dto = await c.QueryFirstOrDefaultAsync($@"
                SELECT TOP 1 GameId, Quarter, QuarterMs, Running, StartedAt, UpdatedAt,
                       RemainingMs = CASE
                         WHEN Running=1 AND StartedAt IS NOT NULL THEN
                           CASE WHEN RemainingMs - DATEDIFF(ms, StartedAt, SYSUTCDATETIME()) > 0
                                THEN RemainingMs - DATEDIFF(ms, StartedAt, SYSUTCDATETIME())
                                ELSE 0 END
                         ELSE RemainingMs
                       END
                FROM {T}GameClocks 
                WHERE GameId=@id
                ORDER BY UpdatedAt DESC;", new { id });

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
        }).RequireAuthorization("ADMIN_OR_USER").WithOpenApi();

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
        }).RequireAuthorization("ADMIN_OR_USER").WithOpenApi();

        // POST start
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
        }).RequireAuthorization("ADMIN_OR_USER").WithOpenApi();

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
        }).RequireAuthorization("ADMIN_OR_USER").WithOpenApi();

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
        }).RequireAuthorization("ADMIN_OR_USER").WithOpenApi();
    }
}
