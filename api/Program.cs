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

// Healthcheck
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Helper: cadena de conexión
string GetConnectionString()
{
    var fromEnv = Environment.GetEnvironmentVariable("DB_CONNECTION_STRING");
    if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;

    return app.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("No hay cadena de conexión configurada.");
}

// 👉 Montamos endpoints desde extensiones (archivo separado)
app.MapGameEndpoints(GetConnectionString);
app.MapClockEndpoints(GetConnectionString);

app.Run();

// DTOs (puedes moverlos a Dtos.cs si prefieres)
record CreateGameDto(string? Home, string? Away);
record ClockResetDto(int? QuarterMs);
record TeamCreateDto(string Name);
record PairDto(int HomeTeamId, int AwayTeamId);
// Players
record CreatePlayerDto(string Name, byte? Number, string? Position);
record UpdatePlayerDto(byte? Number, string? Name, string? Position, bool? Active);

// Score/Foul aceptando jugador (opcional) ← únicas válidas
record ScoreDto(string Team, int Points, int? PlayerId, int? PlayerNumber);
record FoulDto(string Team, int? PlayerId, int? PlayerNumber);
