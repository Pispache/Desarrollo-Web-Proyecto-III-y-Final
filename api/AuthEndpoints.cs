using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.Configuration;

public record LoginDto(string Username, string Password);

public static class AuthEndpoints
{
    const string T = "MarcadorDB.dbo.";

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

    public static bool VerifyPassword(string password, byte[] salt, byte[] expectedHash)
    {
        using var derive = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
        var hash = derive.GetBytes(expectedHash.Length);
        return CryptographicOperations.FixedTimeEquals(hash, expectedHash);
    }

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

    public static (byte[] hash, byte[] salt) HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        using var derive = new Rfc2898DeriveBytes(password, salt, 100_000, HashAlgorithmName.SHA256);
        byte[] hash = derive.GetBytes(32);
        return (hash, salt);
    }
}
