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
        public static void AddJwtAuth(this IServiceCollection services, IConfiguration config)
        {
            var jwtSecret = config["JWT_SECRET"];
            if (string.IsNullOrWhiteSpace(jwtSecret)) return;

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
            });
        }

        public static void UseJwtIfConfigured(this WebApplication app)
        {
            var jwtSecret = app.Configuration["JWT_SECRET"];
            if (!string.IsNullOrWhiteSpace(jwtSecret))
            {
                app.UseAuthentication();
                app.UseAuthorization();
            }
        }
    }
}
