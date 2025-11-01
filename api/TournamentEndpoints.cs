using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Linq;
using System;

/// <summary>
/// Endpoints para gestionar torneos por grupos.
/// </summary>
/// <remarks>
/// Centraliza operaciones para listar, crear y eliminar grupos, así como agregar o quitar
/// equipos dentro de cada grupo.  
///
/// Comportamiento general:
/// - Asegura el esquema mínimo en base de datos al iniciar (tablas <c>TournamentGroups</c> y <c>TournamentGroupTeams</c>).  
/// - Usa el nombre de la base actual (obtenido desde la conexión) para armar el esquema <c>dbo</c>.  
/// - Limita a 4 el número de equipos por grupo.  
/// - Respuestas coherentes: 201 al crear, 204 al borrar/actualizar, 404 si no existe, 409 en duplicados.
/// </remarks>
public static class TournamentEndpoints
{
    // Nota: no usamos el prefijo fijo aquí; tomamos el nombre de base desde la conexión.

    /// <summary>
    /// Fila de grupo de torneo.
    /// </summary>
    /// <remarks>
    /// Representa un grupo con su identificador, nombre y fecha de creación.
    /// </remarks>
    public record GroupRow(int GroupId, string Name, DateTime CreatedAt);

    /// <summary>
    /// Fila que relaciona un grupo con un equipo.
    /// </summary>
    /// <remarks>
    /// Incluye el identificador del grupo, el del equipo y el nombre del equipo.
    /// </remarks>
    public record GroupTeamRow(int GroupId, int TeamId, string Name);

    /// <summary>
    /// Registra los endpoints de torneos (grupos y membresías).
    /// </summary>
    /// <param name="app">Aplicación web donde se mapean las rutas.</param>
    /// <param name="cs">Función que devuelve la cadena de conexión.</param>
    /// <remarks>
    /// Rutas principales:  
    /// - <c>GET  /api/tournaments/default/groups</c> — Lista grupos con sus equipos.  
    /// - <c>POST /api/tournaments/default/groups</c> — Crea un grupo.  
    /// - <c>DELETE /api/tournaments/default/groups/{groupId}</c> — Elimina un grupo y sus equipos.  
    /// - <c>POST /api/tournaments/default/groups/{groupId}/teams</c> — Agrega un equipo al grupo (máx. 4).  
    /// - <c>DELETE /api/tournaments/default/groups/{groupId}/teams/{teamId}</c> — Quita un equipo del grupo.  
    ///
    /// Seguridad:
    /// - Lectura: <c>ADMIN_OR_USER</c>.  
    /// - Cambios (crear/eliminar/agregar/quitar): <c>ADMIN</c>.
    /// </remarks>
    public static void MapTournamentEndpoints(this WebApplication app, Func<string> cs)
    {
        var g = app.MapGroup("/api");

        // Ensure schema for tournament groups
        try
        {
            using var c = new SqlConnection(cs());
            c.Open();
            var TT = $"{c.Database}.dbo.";
            var ensureSql = $@"
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TournamentGroups')
BEGIN
  CREATE TABLE {TT}TournamentGroups (
    GroupId INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TournamentGroupTeams')
BEGIN
  CREATE TABLE {TT}TournamentGroupTeams (
    GroupId INT NOT NULL,
    TeamId INT NOT NULL,
    PRIMARY KEY (GroupId, TeamId)
  );
END;
";
            c.Execute(ensureSql);
        }
        catch { /* best-effort */ }

        // List groups with teams
        g.MapGet("/tournaments/default/groups", async () =>
        {
            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";
            var groups = (await c.QueryAsync<GroupRow>($"SELECT GroupId, Name, CreatedAt FROM {TT}TournamentGroups ORDER BY GroupId DESC"))
                .ToList();
            var teams = (await c.QueryAsync<GroupTeamRow>($@"
SELECT gt.GroupId, gt.TeamId, t.Name
FROM {TT}TournamentGroupTeams gt
LEFT JOIN {TT}Teams t ON t.TeamId = gt.TeamId
"))
                .ToList();

            var result = groups.Select(gr => new
            {
                groupId = gr.GroupId,
                name = gr.Name,
                createdAt = gr.CreatedAt,
                teams = teams.Where(t => t.GroupId == gr.GroupId)
                              .Select(t => new { teamId = t.TeamId, name = t.Name ?? string.Empty })
                              .ToList()
            });
            return Results.Ok(result);
        }).RequireAuthorization("ADMIN_OR_USER").WithOpenApi();

        // Create group
        g.MapPost("/tournaments/default/groups", async ([FromBody] GroupCreateDto body) =>
        {
            var name = (body?.Name ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Nombre es requerido" });
            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";
            // fallback: asegurar esquema por si falló al inicio
            await EnsureSchemaAsync(c);
            // opcional: validar duplicado por nombre
            var dup = await c.ExecuteScalarAsync<int>($"SELECT COUNT(1) FROM {TT}TournamentGroups WHERE Name=@n;", new { n = name });
            if (dup > 0) return Results.Conflict(new { error = "Ya existe un grupo con ese nombre" });
            try
            {
                var id = await c.ExecuteScalarAsync<int>($@"
INSERT INTO {TT}TournamentGroups(Name) OUTPUT INSERTED.GroupId VALUES(@n);
", new { n = name });
                return Results.Created($"/api/tournaments/default/groups/{id}", new { groupId = id, name });
            }
            catch (Exception ex)
            {
                return Results.Problem($"Error creando grupo: {ex.Message}", statusCode: 500);
            }
        }).AddEndpointFilter<ValidationFilter<GroupCreateDto>>().RequireAuthorization("ADMIN").WithOpenApi();

        // Delete group (and its memberships)
        g.MapDelete("/tournaments/default/groups/{groupId:int}", async (int groupId) =>
        {
            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";
            using var tx = c.BeginTransaction();
            await c.ExecuteAsync($"DELETE FROM {TT}TournamentGroupTeams WHERE GroupId=@groupId;", new { groupId }, tx);
            var rows = await c.ExecuteAsync($"DELETE FROM {TT}TournamentGroups WHERE GroupId=@groupId;", new { groupId }, tx);
            if (rows == 0) { tx.Rollback(); return Results.NotFound(); }
            tx.Commit();
            return Results.NoContent();
        }).RequireAuthorization("ADMIN").WithOpenApi();

        // Add team to group
        g.MapPost("/tournaments/default/groups/{groupId:int}/teams", async (int groupId, [FromBody] GroupAddTeamDto body) =>
        {
            var teamId = body?.TeamId ?? 0;
            if (teamId <= 0) return Results.BadRequest(new { error = "teamId inválido" });
            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";
            await EnsureSchemaAsync(c);
            // Enforce max 4 teams per group
            var count = await c.ExecuteScalarAsync<int>($"SELECT COUNT(1) FROM {TT}TournamentGroupTeams WHERE GroupId=@groupId;", new { groupId });
            if (count >= 4) return Results.Conflict(new { error = "Máximo 4 equipos por grupo" });

            try
            {
                await c.ExecuteAsync($"INSERT INTO {TT}TournamentGroupTeams(GroupId, TeamId) VALUES(@groupId, @teamId);", new { groupId, teamId });
            }
            catch (SqlException ex) when (ex.Number == 2627 || ex.Number == 2601)
            {
                return Results.Conflict(new { error = "El equipo ya está en el grupo" });
            }
            catch (Exception ex)
            {
                return Results.Problem($"Error agregando equipo: {ex.Message}", statusCode: 500);
            }
            return Results.NoContent();
        }).AddEndpointFilter<ValidationFilter<GroupAddTeamDto>>().RequireAuthorization("ADMIN").WithOpenApi();

        // Remove team from group
        g.MapDelete("/tournaments/default/groups/{groupId:int}/teams/{teamId:int}", async (int groupId, int teamId) =>
        {
            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";
            var rows = await c.ExecuteAsync($"DELETE FROM {TT}TournamentGroupTeams WHERE GroupId=@groupId AND TeamId=@teamId;", new { groupId, teamId });
            if (rows == 0) return Results.NotFound();
            return Results.NoContent();
        }).RequireAuthorization("ADMIN").WithOpenApi();

        // Persist a generated schedule for a group as Games
        g.MapPost("/tournaments/default/groups/{groupId:int}/schedule", async (int groupId, [FromBody] GroupScheduleDto body) =>
        {
            if (body == null || body.Rounds == null)
                return Results.BadRequest(new { error = "Rounds es requerido" });

            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";

            // Validate group exists
            var exists = await c.ExecuteScalarAsync<int>($"SELECT COUNT(1) FROM {TT}TournamentGroups WHERE GroupId=@groupId;", new { groupId });
            if (exists == 0) return Results.NotFound(new { error = "Grupo no existe" });

            using var tx = c.BeginTransaction();
            try
            {
                int created = 0;
                for (int r = 0; r < body.Rounds.Count; r++)
                {
                    var matches = body.Rounds[r] ?? new List<PairDto>();
                    foreach (var m in matches)
                    {
                        if (m is null) continue;
                        var homeId = m.HomeTeamId;
                        var awayId = m.AwayTeamId;
                        if (homeId <= 0 || awayId <= 0) continue;

                        // Optionally ensure both teams belong to some group (or to this group)
                        var allowed = await c.ExecuteScalarAsync<int>($"SELECT COUNT(1) FROM {TT}TournamentGroupTeams WHERE GroupId=@groupId AND TeamId IN (@homeId, @awayId);", new { groupId, homeId, awayId }, tx);
                        if (allowed < 2) continue;

                        var names = await c.QueryAsync<(string Name, int TeamId)>($"SELECT Name, TeamId FROM {TT}Teams WHERE TeamId IN (@homeId, @awayId);", new { homeId, awayId }, tx);
                        var homeName = names.FirstOrDefault(x => x.TeamId == homeId).Name;
                        var awayName = names.FirstOrDefault(x => x.TeamId == awayId).Name;
                        if (string.IsNullOrWhiteSpace(homeName) || string.IsNullOrWhiteSpace(awayName)) continue;

                        var gameId = await c.ExecuteScalarAsync<int>(
                            $@"INSERT INTO {TT}Games(HomeTeam, AwayTeam, HomeTeamId, AwayTeamId, Status, Quarter)
                               OUTPUT INSERTED.GameId
                               VALUES(@homeName, @awayName, @homeId, @awayId, 'SCHEDULED', 1);",
                            new { homeName, awayName, homeId, awayId }, tx);

                        // Ensure default GameClocks row
                        await c.ExecuteAsync($@"IF NOT EXISTS(SELECT 1 FROM {TT}GameClocks WHERE GameId=@gameId)
                                                 INSERT INTO {TT}GameClocks(GameId, Quarter, QuarterMs, RemainingMs, Running, StartedAt, UpdatedAt)
                                                 VALUES(@gameId, 1, 600000, 600000, 0, NULL, SYSUTCDATETIME());",
                                                 new { gameId }, tx);

                        created++;
                    }
                }
                tx.Commit();
                return Results.Ok(new { created });
            }
            catch (Exception ex)
            {
                tx.Rollback();
                return Results.Problem($"Error guardando calendario: {ex.Message}", statusCode: 500);
            }
        }).AddEndpointFilter<ValidationFilter<GroupScheduleDto>>().RequireAuthorization("ADMIN").WithOpenApi();

        static SqlConnection Open(string cs) { var c = new SqlConnection(cs); c.Open(); return c; }

        /// <summary>
        /// Garantiza que existan las tablas necesarias para grupos y sus equipos.
        /// </summary>
        /// <param name="c">Conexión SQL Server abierta.</param>
        /// <remarks>
        /// Crea las tablas <c>TournamentGroups</c> y <c>TournamentGroupTeams</c> si no existen.  
        /// Se ejecuta de forma segura y puede llamarse varias veces sin efectos secundarios.
        /// </remarks>
        static async Task EnsureSchemaAsync(SqlConnection c)
        {
            var TT = $"{c.Database}.dbo.";
            var ensureSql = $@"
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TournamentGroups')
BEGIN
  CREATE TABLE {TT}TournamentGroups (
    GroupId INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TournamentGroupTeams')
BEGIN
  CREATE TABLE {TT}TournamentGroupTeams (
    GroupId INT NOT NULL,
    TeamId INT NOT NULL,
    PRIMARY KEY (GroupId, TeamId)
  );
END;";
            await c.ExecuteAsync(ensureSql);
        }
    }
}

/// <summary>
/// Datos para crear un grupo de torneo.
/// </summary>
/// <remarks>
/// Solo requiere un nombre. Se valida que no esté vacío ni repetido.
/// </remarks>
public record GroupCreateDto(string Name);

/// <summary>
/// Datos para agregar un equipo a un grupo.
/// </summary>
/// <remarks>
/// Recibe el identificador del equipo que se incorporará al grupo.  
/// Se limita a 4 equipos por grupo y no se permiten duplicados.
/// </remarks>
public record GroupAddTeamDto(int TeamId);
public record GroupScheduleDto(List<List<PairDto>> Rounds);
