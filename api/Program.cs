using Dapper;
using Microsoft.Data.SqlClient;

var b = WebApplication.CreateBuilder(args);
b.Services.AddEndpointsApiExplorer();
b.Services.AddSwaggerGen();
b.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = b.Build();
app.UseCors();

if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Connection string local a Program y pasada como delegado (soluciona CS8801)
string GetCs() =>
    Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
    ?? app.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("No hay cadena de conexión.");

app.MapGameEndpoints(GetCs);
app.MapClockEndpoints(GetCs);

app.Run();

// DTOs (manténlo aquí o muévelo a Dtos.cs)
record CreateGameDto(string? Home, string? Away);
record TeamCreateDto(string Name);
record PairDto(int HomeTeamId, int AwayTeamId);
record CreatePlayerDto(string Name, byte? Number, string? Position);
record UpdatePlayerDto(byte? Number, string? Name, string? Position, bool? Active);
record ScoreDto(string Team, int Points, int? PlayerId, int? PlayerNumber);
record FoulDto(string Team, int? PlayerId, int? PlayerNumber);
record ClockResetDto(int? QuarterMs);
