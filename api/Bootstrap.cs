using Dapper;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

/// <summary>
/// Rutinas de arranque para preparar usuarios administradores al iniciar la aplicación.
/// </summary>
/// <remarks>
/// Esta inicialización crea o actualiza cuentas de administrador según la configuración disponible,
/// para que el sistema sea usable desde el primer arranque. Soporta tres fuentes, en este orden:
/// 1) Archivo JSON indicado por <c>ADMIN_USERS_FILE</c>.
/// 2) Cadena <c>ADMIN_USERS</c> con varios usuarios en el formato <c>user:pass[:role];…</c>.
/// 3) Variables <c>ADMIN_USERNAME</c> y <c>ADMIN_PASSWORD</c> para un único usuario.
/// 
/// - Las contraseñas se almacenan como hash con sal (vía <c>AuthEndpoints.HashPassword</c>).
/// - Si el usuario ya existe, puede actualizarse (archivo JSON) o se omite (otras fuentes).
/// - Se registran mensajes en el log para facilitar el seguimiento.
/// </remarks>
public static class Bootstrap
{
    /// <summary>
    /// Crea o actualiza cuentas de administrador a partir de la configuración.
    /// </summary>
    /// <param name="app">Aplicación web, usada para leer configuración y escribir logs.</param>
    /// <param name="cs">Función que devuelve la cadena de conexión a la base de datos.</param>
    /// <remarks>
    /// <para><b>Fuentes admitidas</b></para>
    /// • <c>ADMIN_USERS_FILE</c>: ruta a un JSON con un arreglo de usuarios
    ///   (ej.: <c>[{"{ \"username\":\"...\",\"password\":\"...\",\"role\":\"ADMIN\" }"}]</c>).  
    /// • <c>ADMIN_USERS</c>: varios usuarios separados por punto y coma. Ej.:  
    ///   <c>ADMIN_USERS="admin:Admin123!:ADMIN;editor:Ed1t0r!:EDITOR"</c>.  
    /// • <c>ADMIN_USERNAME</c> / <c>ADMIN_PASSWORD</c>: crea un único usuario con rol ADMIN.
    /// 
    /// <para><b>Comportamiento</b></para>
    /// - Intenta primero el archivo JSON. Si falla o no existe, usa <c>ADMIN_USERS</c>.  
    /// - Si tampoco está definido, usa el par usuario/contraseña único.  
    /// - Las entradas inválidas se omiten y se deja constancia en el log.  
    /// - Los roles se normalizan en mayúsculas; si no se especifica, se usa <c>ADMIN</c>.
    /// </remarks>
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

                        var (hash, salt) = AuthEndpoints.HashPassword(p);
                        if (exists > 0)
                        {
                            await c.ExecuteAsync(
                                "UPDATE MarcadorDB.dbo.AdminUsers SET PasswordHash=@h, PasswordSalt=@s, Role=@r, Active=1 WHERE Username=@u;",
                                new { u, h = hash, s = salt, r });
                            app.Logger.LogInformation("Admin user '{User}' updated from file with role {Role}.", u, r);
                        }
                        else
                        {
                            await c.ExecuteAsync(
                                "INSERT INTO MarcadorDB.dbo.AdminUsers(Username, PasswordHash, PasswordSalt, Role, Active) VALUES(@u, @h, @s, @r, 1);",
                                new { u, h = hash, s = salt, r });
                            app.Logger.LogInformation("Admin user '{User}' seeded from file with role {Role}.", u, r);
                        }
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

    /// <summary>
    /// Estructura de datos usada para leer usuarios desde el archivo JSON.
    /// </summary>
    /// <remarks>
    /// Campos reconocidos:
    /// - <c>Username</c>: nombre de usuario (obligatorio).
    /// - <c>Password</c>: contraseña en texto plano que será cifrada antes de guardarse (obligatorio).
    /// - <c>Role</c>: rol del usuario (opcional, por defecto <c>ADMIN</c>).
    /// </remarks>
    private record UserSeed
    {
        /// <summary>Nombre de usuario.</summary>
        public string Username { get; init; } = string.Empty;

        /// <summary>Contraseña en texto plano (se guardará como hash con sal).</summary>
        public string Password { get; init; } = string.Empty;

        /// <summary>Rol asignado. Si no se indica, se usará ADMIN.</summary>
        public string? Role { get; init; }
    }
}
