using Dapper;
using Microsoft.Data.SqlClient;

public static class Bootstrap
{
    public static async Task SeedAdminAsync(WebApplication app, Func<string> cs)
    {
        var user = app.Configuration["ADMIN_USERNAME"];
        var pass = app.Configuration["ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrWhiteSpace(pass)) return;

        try
        {
            using var c = new SqlConnection(cs());
            var exists = await c.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM MarcadorDB.dbo.AdminUsers WHERE Username=@u;", new { u = user });
            if (exists > 0) return;

            var (hash, salt) = AuthEndpoints.HashPassword(pass);
            await c.ExecuteAsync(
                "INSERT INTO MarcadorDB.dbo.AdminUsers(Username, PasswordHash, PasswordSalt, Role, Active) VALUES(@u, @h, @s, 'ADMIN', 1);",
                new { u = user, h = hash, s = salt });
            app.Logger.LogInformation("Admin user '{User}' seeded.", user);
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "Error seeding admin user");
        }
    }
}
