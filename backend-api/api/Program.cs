using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.IO;
using FluentValidation;

/// <summary>
/// Punto de entrada de la API del marcador.
/// </summary>
/// <remarks>
/// - Registra servicios base (Swagger, CORS) y, si está configurado, la autenticación por JWT.  
/// - Expone un endpoint de salud para monitoreo.  
/// - Resuelve la cadena de conexión y mapea los endpoints del dominio (auth, juegos, reloj, torneos).  
/// - Realiza un sembrado opcional de usuarios admin a partir de variables de entorno o archivo.
/// </remarks>

// Configura DbContext, CORS (en dev), healthcheck y endpoints del dominio de juego.
var b = WebApplication.CreateBuilder(args);

/// <summary>
/// Servicios mínimos para documentación y exploración de la API.
/// </summary>
/// <remarks>
/// Habilita generación de OpenAPI/Swagger y el CORS por defecto para permitir pruebas locales.
/// </remarks>
b.Services.AddEndpointsApiExplorer();
b.Services.AddSwaggerGen();
b.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// FluentValidation: registrar validadores del ensamblado
b.Services.AddValidatorsFromAssemblyContaining<TeamUpsertDtoValidator>();

// ============================
// Autenticación por JWT (opcional)
// ============================

/// <summary>
/// Configuración condicional de autenticación JWT.
/// </summary>
/// <remarks>
/// Si <c>JWT_SECRET</c> está definido, se activan autenticación y autorización:
/// - Emisor y audiencia se leen de <c>JWT_ISSUER</c> y <c>JWT_AUDIENCE</c> (con valores por defecto).  
/// - Se agregan dos políticas de autorización: <c>ADMIN</c> y <c>ADMIN_OR_USER</c>.
/// </remarks>
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

    /// <summary>
    /// Políticas de autorización para proteger endpoints.
    /// </summary>
    /// <remarks>
    /// - <c>ADMIN</c>: acceso exclusivo a rol administrador.  
    /// - <c>ADMIN_OR_USER</c>: acceso para roles <c>ADMIN</c> o <c>USUARIO</c>.
    /// </remarks>
    b.Services.AddAuthorization(options =>
    {
        options.AddPolicy("ADMIN", p => p.RequireRole("ADMIN"));
        // Allow both ADMIN and USUARIO roles to access certain endpoints
        options.AddPolicy("ADMIN_OR_USER", p => p.RequireRole("ADMIN", "USUARIO"));
    });
}

var app = b.Build();

/// <summary>
/// Habilita CORS con la política por defecto.
/// </summary>
app.UseCors();

// ============================
// Archivos estáticos (logos)
// ============================

/// <summary>
/// Publicación de archivos estáticos para logos de equipos.
/// </summary>
/// <remarks>
/// Crea el directorio de subida si no existe y habilita la entrega desde <c>wwwroot</c>.
/// </remarks>
// Static files (serve team logos from wwwroot/uploads/logos)
var contentRoot = app.Environment.ContentRootPath;
var uploadsDir = Path.Combine(contentRoot, "wwwroot", "uploads", "logos");
Directory.CreateDirectory(uploadsDir);
app.UseStaticFiles();

/// <summary>
/// UI de Swagger disponible en entorno de desarrollo.
/// </summary>
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }

/// <summary>
/// Endpoint de salud para monitoreo y readiness del contenedor.
/// </summary>
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ============================
// Conexión a base de datos
// ============================

/// <summary>
/// Resuelve la cadena de conexión a la base de datos.
/// </summary>
/// <remarks>
/// Prioridad:  
/// 1) Variable de entorno <c>DB_CONNECTION_STRING</c>.  
/// 2) <c>ConnectionStrings:DefaultConnection</c> del archivo de configuración.  
/// 3) Lanza excepción si no hay valor disponible.
/// </remarks>
// Connection string local a Program y pasada como delegado (soluciona CS8801)
string GetCs() =>
    Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
    ?? app.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("No hay cadena de conexión.");

// ============================
// Endpoints del dominio
// ============================

// Login local deshabilitado: autenticación centralizada en auth-service (OAuth2.0 + JWT)

/// <summary>
/// Activación de middlewares de autenticación/autorización si hay JWT configurado.
/// </summary>
if (!string.IsNullOrWhiteSpace(jwtSecret))
{
    app.UseAuthentication();
    app.UseAuthorization();
}

/// <summary>
/// Registro de endpoints de juegos, reloj y torneos.
/// </summary>
app.MapGameEndpoints(GetCs);
app.MapClockEndpoints(GetCs);
app.MapTournamentEndpoints(GetCs);

/// <summary>
/// Arranque de la aplicación web.
/// </summary>
app.Run();
