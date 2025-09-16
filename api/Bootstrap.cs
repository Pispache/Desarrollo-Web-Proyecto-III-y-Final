using Dapper;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

public static class Bootstrap
{
    public static async Task SeedAdminAsync(WebApplication app, Func<string> cs)
    {
        // Opción amigable: archivo JSON configurable con ADMIN_USERS_FILE (e.g. "/app/users.json")
        // Estructura: [ { "username": "...", "password": "...", "role": "ADMIN" }, ... ]
        var usersFile = app.Configuration["ADMIN_USERS_FILE"];

        // Soporta múltiples usuarios vía ADMIN_USERS en formato:
        //   ADMIN_USERS="user1:pass1[:role1];user2:pass2[:role2]"
        // Si no se define ADMIN_USERS, usa el comportamiento anterior con ADMIN_USERNAME/ADMIN_PASSWORD.
        var multi = app.Configuration["ADMIN_USERS"]; // e.g. "admin:Admin123!:ADMIN;editor:Ed1t0r!:EDITOR"

        try
        {
            using var c = new SqlConnection(cs());

            // 1) Archivo JSON (más sencillo de mantener)
            if (!string.IsNullOrWhiteSpace(usersFile) && File.Exists(usersFile))
            {
                try
                {
                    var json = await File.ReadAllTextAsync(usersFile);
                    var list = JsonSerializer.Deserialize<List<UserSeed>>(json, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    }) ?? new List<UserSeed>();

                    foreach (var item in list)
                    {
                        if (item == null || string.IsNullOrWhiteSpace(item.Username) || string.IsNullOrWhiteSpace(item.Password))
                        {
                            app.Logger.LogWarning("Entrada inválida en {File}", usersFile);
                            continue;
                        }

                        var u = item.Username.Trim();
                        var p = item.Password;
                        var r = string.IsNullOrWhiteSpace(item.Role) ? "ADMIN" : item.Role!.Trim().ToUpperInvariant();

                        var exists = await c.ExecuteScalarAsync<int>(
                            "SELECT COUNT(1) FROM MarcadorDB.dbo.AdminUsers WHERE Username=@u;", new { u });
                        if (exists > 0) continue;

                        var (hash, salt) = AuthEndpoints.HashPassword(p);
                        await c.ExecuteAsync(
                            "INSERT INTO MarcadorDB.dbo.AdminUsers(Username, PasswordHash, PasswordSalt, Role, Active) VALUES(@u, @h, @s, @r, 1);",
                            new { u, h = hash, s = salt, r });
                        app.Logger.LogInformation("Admin user '{User}' seeded from file with role {Role}.", u, r);
                    }

                    return; // ya procesamos archivo JSON
                }
                catch (Exception exFile)
                {
                    app.Logger.LogError(exFile, "Error leyendo ADMIN_USERS_FILE: {File}", usersFile);
                    // continúa a otras opciones
                }
            }

            if (!string.IsNullOrWhiteSpace(multi))
            {
                var entries = multi.Split(';', StringSplitOptions.RemoveEmptyEntries);
                foreach (var entry in entries)
                {
                    var parts = entry.Split(':', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length < 2)
                    {
                        app.Logger.LogWarning("Entrada inválida en ADMIN_USERS: {Entry}", entry);
                        continue;
                    }

                    var u = parts[0].Trim();
                    var p = parts[1];
                    var r = (parts.Length >= 3 && !string.IsNullOrWhiteSpace(parts[2]))
                        ? parts[2].Trim().ToUpperInvariant()
                        : "ADMIN";

                    var exists = await c.ExecuteScalarAsync<int>(
                        "SELECT COUNT(1) FROM MarcadorDB.dbo.AdminUsers WHERE Username=@u;", new { u });
                    if (exists > 0) continue;

                    var (hash, salt) = AuthEndpoints.HashPassword(p);
                    await c.ExecuteAsync(
                        "INSERT INTO MarcadorDB.dbo.AdminUsers(Username, PasswordHash, PasswordSalt, Role, Active) VALUES(@u, @h, @s, @r, 1);",
                        new { u, h = hash, s = salt, r });
                    app.Logger.LogInformation("Admin user '{User}' seeded with role {Role}.", u, r);
                }

                return; // ya procesamos ADMIN_USERS
            }

            // Fallback: un solo usuario desde ADMIN_USERNAME/ADMIN_PASSWORD
            var user = app.Configuration["ADMIN_USERNAME"];
            var pass = app.Configuration["ADMIN_PASSWORD"];
            if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass)) return;

            var existsSingle = await c.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM MarcadorDB.dbo.AdminUsers WHERE Username=@u;", new { u = user });
            if (existsSingle > 0) return;

            var (hashSingle, saltSingle) = AuthEndpoints.HashPassword(pass);
            await c.ExecuteAsync(
                "INSERT INTO MarcadorDB.dbo.AdminUsers(Username, PasswordHash, PasswordSalt, Role, Active) VALUES(@u, @h, @s, 'ADMIN', 1);",
                new { u = user, h = hashSingle, s = saltSingle });
            app.Logger.LogInformation("Admin user '{User}' seeded.", user);
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Error seeding admin user");
        }
    }

    private record UserSeed
    {
        public string Username { get; init; } = string.Empty;
        public string Password { get; init; } = string.Empty;
        public string? Role { get; init; }
    }
}
