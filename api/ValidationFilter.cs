using System.Linq;
using System.Threading.Tasks;
using FluentValidation;
using Microsoft.AspNetCore.Http;

/// <summary>
/// Filtro de endpoint para ejecutar validaciones FluentValidation sobre DTOs.
/// </summary>
/// <remarks>
/// - Si existe un <c>IValidator&lt;T&gt;</c> registrado, valida el DTO del request antes de ejecutar el handler.
/// - En caso de errores, devuelve 400 con cuerpo: <c>{ success: false, errors: [{ field, message }] }</c>.
/// - Si no hay validador registrado o no se encuentra un argumento <c>T</c>, continúa con la ejecución normal.
/// </remarks>
public class ValidationFilter<T> : IEndpointFilter
{
    public async ValueTask<object> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var validator = context.HttpContext.RequestServices.GetService(typeof(IValidator<T>)) as IValidator<T>;
        if (validator is null)
        {
            return await next(context);
        }

        var dto = context.Arguments.FirstOrDefault(a => a is T);
        if (dto is null)
        {
            return await next(context);
        }

        var result = await validator.ValidateAsync(new ValidationContext<T>((T)dto));
        if (!result.IsValid)
        {
            var errors = result.Errors
                .Where(e => e is not null)
                .Select(e => new { field = e.PropertyName, message = e.ErrorMessage })
                .ToArray();

            return Results.BadRequest(new { success = false, errors });
        }

        return await next(context);
    }
}
