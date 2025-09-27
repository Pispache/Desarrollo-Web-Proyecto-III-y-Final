using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Linq;
using System;

public static class TournamentEndpoints
{
    // Nota: no usamos el prefijo fijo aquí; tomamos el nombre de base desde la conexión.

    public record GroupRow(int GroupId, string Name, DateTime CreatedAt);
    public record GroupTeamRow(int GroupId, int TeamId, string Name);

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
        }).RequireAuthorization("ADMIN").WithOpenApi();

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
        }).RequireAuthorization("ADMIN").WithOpenApi();

        // Remove team from group
        g.MapDelete("/tournaments/default/groups/{groupId:int}/teams/{teamId:int}", async (int groupId, int teamId) =>
        {
            using var c = Open(cs());
            var TT = $"{c.Database}.dbo.";
            var rows = await c.ExecuteAsync($"DELETE FROM {TT}TournamentGroupTeams WHERE GroupId=@groupId AND TeamId=@teamId;", new { groupId, teamId });
            if (rows == 0) return Results.NotFound();
            return Results.NoContent();
        }).RequireAuthorization("ADMIN").WithOpenApi();

        static SqlConnection Open(string cs) { var c = new SqlConnection(cs); c.Open(); return c; }
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

public record GroupCreateDto(string Name);
public record GroupAddTeamDto(int TeamId);
