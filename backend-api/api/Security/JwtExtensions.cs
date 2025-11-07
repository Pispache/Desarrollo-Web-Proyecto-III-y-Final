using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Text;

namespace Api.Security
{
    public static class JwtExtensions
    {
        /// <summary>
        /// Configura autenticación y autorización JWT.
        /// </summary>
        /// <param name="services">Contenedor de servicios de la aplicación.</param>
        /// <param name="config">Configuración para leer secretos y parámetros de JWT.</param>
        /// <remarks>
        /// - Activa fail-fast en Producción si falta <c>JWT_SECRET</c>.
        /// - Define políticas <c>ADMIN</c> y <c>ADMIN_OR_USER</c>.
        /// - Establece <c>FallbackPolicy</c> para denegar por defecto (toda ruta requiere estar autenticado salvo <c>AllowAnonymous</c>).
        /// </remarks>
        public static void AddJwtAuth(this IServiceCollection services, IConfiguration config)
        {
            var jwtSecret = config["JWT_SECRET"];
            if (string.IsNullOrWhiteSpace(jwtSecret))
            {
                var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
                if (!string.Equals(env, "Development", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("JWT_SECRET no configurado en producción.");
                }
                // En desarrollo permitimos continuar sin auth
                return;
            }

            services
                .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidateAudience = true,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        ValidIssuer = config["JWT_ISSUER"] ?? "MarcadorApi",
                        ValidAudience = config["JWT_AUDIENCE"] ?? "MarcadorUi",
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
                    };
                });

            services.AddAuthorization(options =>
            {
                options.AddPolicy("ADMIN", p => p.RequireRole("ADMIN"));
                options.AddPolicy("ADMIN_OR_USER", p => p.RequireRole("ADMIN", "USUARIO"));
                // Denegar por defecto: toda ruta requiere usuario autenticado salvo que se marque AllowAnonymous
                options.FallbackPolicy = options.DefaultPolicy;
            });
        }

        /// <summary>
        /// Habilita los middlewares de autenticación y autorización.
        /// </summary>
        /// <param name="app">Aplicación web mínima.</param>
        /// <remarks>
        /// - Se invoca siempre; si no hay esquema configurado (dev sin JWT), no tendrá efecto.
        /// - En Producción, combinado con <c>AddJwtAuth</c>, asegura autenticación siempre activa.
        /// </remarks>
        public static void UseJwtIfConfigured(this WebApplication app)
        {
            // Habilitar middlewares; si no hay esquema (dev sin JWT), no tendrá efecto
            app.UseAuthentication();
            app.UseAuthorization();
        }
    }
}
