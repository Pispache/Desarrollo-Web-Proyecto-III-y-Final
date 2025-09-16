using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var b = WebApplication.CreateBuilder(args);
b.Services.AddEndpointsApiExplorer();
b.Services.AddSwaggerGen();
b.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// JWT Authentication
var jwtSecret = b.Configuration["JWT_SECRET"];
if (!string.IsNullOrWhiteSpace(jwtSecret))
{
    b.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = b.Configuration["JWT_ISSUER"] ?? "MarcadorApi",
                ValidAudience = b.Configuration["JWT_AUDIENCE"] ?? "MarcadorUi",
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
            };
        });
    b.Services.AddAuthorization(options =>
    {
        options.AddPolicy("ADMIN", p => p.RequireRole("ADMIN"));
    });
}

var app = b.Build();
app.UseCors();

if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// Connection string local a Program y pasada como delegado (soluciona CS8801)
string GetCs() =>
    Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
    ?? app.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("No hay cadena de conexión.");

// Auth endpoints (login)
app.MapAuthEndpoints(GetCs);

// Enable auth middleware only if configured
if (!string.IsNullOrWhiteSpace(jwtSecret))
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// Seed admin user (if env vars provided)
await Bootstrap.SeedAdminAsync(app, GetCs);

app.MapGameEndpoints(GetCs);
app.MapClockEndpoints(GetCs);

app.Run();

