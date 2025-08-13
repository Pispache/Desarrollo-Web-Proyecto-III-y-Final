using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS (abierto en dev; en prod restringe orígenes)
builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var app = builder.Build();

app.UseCors();

// Swagger solo en Development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// SIN HTTPS redirection para facilitar pruebas locales/docker
// app.UseHttpsRedirection();

// Healthcheck simple
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Helper para obtener la cadena de conexión
string GetConnectionString()
{
    // 1) Prioriza variable de entorno (útil en Docker)
    var fromEnv = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING");
    if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;

    // 2) Fallback a appsettings.json
    return app.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("No hay cadena de conexión configurada.");
}

// GET: últimos 50 partidos
app.MapGet("/api/games", async () =>
{
    using var conn = new SqlConnection(GetConnectionString());
    var rows = await conn.QueryAsync(@"
        IF DB_ID('MarcadorDB') IS NULL SELECT 0 AS Ready ELSE SELECT 1 AS Ready;
        SELECT TOP 50 * FROM MarcadorDB.dbo.Games ORDER BY GameId DESC;
    ");
    return Results.Ok(rows);
})
.WithName("GetGames")
.WithOpenApi();

// POST: crear partido
app.MapPost("/api/games", async ([FromBody] CreateGameDto body) =>
{
    var home = string.IsNullOrWhiteSpace(body?.Home) ? "Local" : body!.Home.Trim();
    var away = string.IsNullOrWhiteSpace(body?.Away) ? "Visitante" : body!.Away.Trim();

    using var conn = new SqlConnection(GetConnectionString());
    var id = await conn.ExecuteScalarAsync<int>(@"
        INSERT INTO MarcadorDB.dbo.Games(HomeTeam, AwayTeam, CreatedAt)
        OUTPUT INSERTED.GameId
        VALUES(@home, @away, SYSUTCDATETIME());
    ", new { home, away });

    return Results.Created($"/api/games/{id}", new { GameId = id, Home = home, Away = away });
})
.WithName("CreateGame")
.WithOpenApi();

app.Run();

record CreateGameDto(string? Home, string? Away);
