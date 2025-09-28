using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Configuration;

/// <summary>
/// Datos de acceso para iniciar sesión.
/// </summary>
/// <remarks>
/// Contiene el usuario y la contraseña que envía el cliente al autenticarse.
/// </remarks>
public record LoginDto(string Username, string Password);

/// <summary>
/// Endpoints de autenticación: inicio de sesión y emisión de token.
/// </summary>
/// <remarks>
/// Este módulo valida credenciales contra la base de datos y entrega un token de acceso (JWT)
/// para que el cliente pueda usar el resto de la API protegida.
/// </remarks>
public static class AuthEndpoints
{
    /// <summary>
    /// Prefijo de esquema y base de datos usado en las consultas SQL.
    /// </summary>
    private const string T = "MarcadorDB.dbo."; // prefijo schema

    /// <summary>
    /// Registra los endpoints de autenticación en la aplicación.
    /// </summary>
    /// <param name="app">Aplicación web donde se mapean las rutas.</param>
    /// <param name="cs">Función que devuelve la cadena de conexión a la base de datos.</param>
    /// <remarks>
    /// Rutas expuestas:
    /// - <c>POST /api/auth/login</c>: recibe usuario y contraseña, valida y devuelve un JWT con su fecha de vencimiento.
    ///
    /// Respuestas habituales:
    /// - <c>400</c> si faltan datos.
    /// - <c>401</c> si las credenciales no son válidas.
    /// - <c>200</c> con el token cuando el inicio es correcto.
    /// </remarks>
    public static void MapAuthEndpoints(this WebApplication app, Func<string> cs)
    {
        app.MapPost("/api/auth/login", async ([FromBody] LoginDto dto) =>
        {
            if (dto is null || string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
                return Results.BadRequest(new { error = "Credenciales inválidas" });

            using var c = new SqlConnection(cs());
            var row = await c.QuerySingleOrDefaultAsync("SELECT TOP 1 UserId, Username, PasswordHash, PasswordSalt, Role, Active FROM " + T + "AdminUsers WHERE Username=@u AND Active=1;", new { u = dto.Username.Trim() });
            if (row is null) return Results.Unauthorized();

            byte[] hash = (byte[])row.PasswordHash;
            byte[] salt = (byte[])row.PasswordSalt;
            if (!VerifyPassword(dto.Password, salt, hash)) return Results.Unauthorized();

            var role = (string)row.Role;
            var jwt = IssueJwt(app.Configuration, (int)row.UserId, (string)row.Username, role);
            return Results.Ok(new { accessToken = jwt.accessToken, expiresAt = jwt.expiresAt });
        }).WithOpenApi();
    }

    /// <summary>
    /// Verifica que una contraseña coincida con su hash almacenado.
    /// </summary>
    /// <param name="password">Contraseña en texto plano recibida del usuario.</param>
    /// <param name="salt">Sal usada al generar el hash original.</param>
    /// <param name="expectedHash">Hash esperado almacenado en la base de datos.</param>
    /// <returns><c>true</c> si la verificación es correcta; en caso contrario, <c>false</c>.</returns>
    /// <remarks>
    /// Se deriva un hash a partir de la contraseña y la sal, y se compara de forma segura con el valor almacenado.
    /// </remarks>
    public static bool VerifyPassword(string password, byte[] salt, byte[] expectedHash)
    {
        using var derive = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
        var hash = derive.GetBytes(expectedHash.Length);
        return CryptographicOperations.FixedTimeEquals(hash, expectedHash);
    }

    /// <summary>
    /// Genera un token de acceso (JWT) para el usuario autenticado.
    /// </summary>
    /// <param name="cfg">Configuración de la aplicación (contiene las claves del JWT).</param>
    /// <param name="userId">Identificador del usuario.</param>
    /// <param name="username">Nombre de usuario.</param>
    /// <param name="role">Rol asignado al usuario.</param>
    /// <returns>
    /// Una tupla con el token de acceso firmado y su fecha de vencimiento.
    /// </returns>
    /// <remarks>
    /// Usa una clave secreta, emisor y audiencia definidos en la configuración.  
    /// Incluye reclamaciones básicas (id, nombre y rol) y asigna una expiración en minutos.
    /// </remarks>
    public static (string accessToken, DateTimeOffset expiresAt) IssueJwt(IConfiguration cfg, int userId, string username, string role)
    {
        var secret = cfg["JWT_SECRET"] ?? throw new InvalidOperationException("JWT_SECRET no configurado");
        var issuer = cfg["JWT_ISSUER"] ?? "MarcadorApi";
        var audience = cfg["JWT_AUDIENCE"] ?? "MarcadorUi";
        var minutes = int.TryParse(cfg["JWT_EXPIRES_MINUTES"], out var m) ? m : 60;

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, username),
            new(ClaimTypes.Name, username),
            new(ClaimTypes.Role, role)
        };
        var expires = DateTime.UtcNow.AddMinutes(minutes);
        var token = new JwtSecurityToken(issuer, audience, claims, expires: expires, signingCredentials: creds);
        var jwt = new JwtSecurityTokenHandler().WriteToken(token);
        return (jwt, new DateTimeOffset(expires));
    }

    /// <summary>
    /// Crea el hash y la sal para almacenar una contraseña de forma segura.
    /// </summary>
    /// <param name="password">Contraseña en texto plano.</param>
    /// <returns>
    /// Una tupla con el <c>hash</c> resultante y la <c>salt</c> utilizada.
    /// </returns>
    /// <remarks>
    /// Genera una sal aleatoria y deriva el hash.  
    /// Este resultado se guarda en la base de datos para validar futuros inicios de sesión.
    /// </remarks>
    public static (byte[] hash, byte[] salt) HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        using var derive = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
        byte[] hash = derive.GetBytes(32);
        return (hash, salt);
    }
}
