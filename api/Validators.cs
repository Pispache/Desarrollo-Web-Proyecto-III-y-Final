using System;
using System.Collections.Generic;
using FluentValidation;

/// <summary>
/// Conjunto de validadores FluentValidation para los DTOs de la API.
/// </summary>
/// <remarks>
/// - Cada clase define reglas de validación coherentes con las restricciones de negocio.
/// - Se integran mediante <c>ValidationFilter&lt;T&gt;</c> en los endpoints para devolver 400 con <c>{ success: false, errors: [{ field, message }] }</c>.
/// - Mantienen mensajes claros y rangos seguros para prevenir datos inválidos.
/// </remarks>
public class TeamUpsertDtoValidator : AbstractValidator<TeamUpsertDto>
{
    /// <summary>
    /// Valida creación/actualización de equipos.
    /// </summary>
    /// <remarks>
    /// - <c>Name</c> requerido, 2-100 caracteres.
    /// - <c>City</c> opcional, hasta 100.
    /// - <c>LogoUrl</c> vacío o URL http(s)/ruta absoluta iniciando con '/'.
    /// </remarks>
    public TeamUpsertDtoValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2).MaximumLength(100);
        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.LogoUrl)
            .Must(u => string.IsNullOrWhiteSpace(u) || u.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || u.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || u.StartsWith("/"))
            .WithMessage("LogoUrl debe ser una URL http(s) o ruta absoluta iniciando con '/'");
    }
}

public class CreatePlayerDtoValidator : AbstractValidator<CreatePlayerDto>
{
    /// <summary>
    /// Valida alta de jugador.
    /// </summary>
    /// <remarks>
    /// - <c>Name</c> requerido, 2-100.
    /// - <c>Number</c> 0-99 (opcional).
    /// - <c>Position</c> hasta 20 (opcional).
    /// - <c>HeightCm</c> 120-250 (opcional).
    /// - <c>Age</c> 10-60 (opcional).
    /// - <c>Nationality</c> hasta 100 (opcional).
    /// </remarks>
    public CreatePlayerDtoValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2).MaximumLength(100);
        RuleFor(x => x.Number).InclusiveBetween((byte)0, (byte)99).When(x => x.Number.HasValue);
        RuleFor(x => x.Position).MaximumLength(20).When(x => !string.IsNullOrWhiteSpace(x.Position));
        RuleFor(x => x.HeightCm).InclusiveBetween(120, 250).When(x => x.HeightCm.HasValue);
        RuleFor(x => x.Age).InclusiveBetween(10, 60).When(x => x.Age.HasValue);
        RuleFor(x => x.Nationality).MaximumLength(100).When(x => !string.IsNullOrWhiteSpace(x.Nationality));
    }
}

public class UpdatePlayerDtoValidator : AbstractValidator<UpdatePlayerDto>
{
    /// <summary>
    /// Valida actualización parcial de jugador.
    /// </summary>
    /// <remarks>
    /// - Aplica mismas reglas que creación pero solo a campos presentes.
    /// - Permite nulls para mantener valores actuales.
    /// </remarks>
    public UpdatePlayerDtoValidator()
    {
        RuleFor(x => x.Name).MinimumLength(2).MaximumLength(100).When(x => x.Name != null);
        RuleFor(x => x.Number).InclusiveBetween((byte)0, (byte)99).When(x => x.Number.HasValue);
        RuleFor(x => x.Position).MaximumLength(20).When(x => x.Position != null);
        RuleFor(x => x.HeightCm).InclusiveBetween(120, 250).When(x => x.HeightCm.HasValue);
        RuleFor(x => x.Age).InclusiveBetween(10, 60).When(x => x.Age.HasValue);
        RuleFor(x => x.Nationality).MaximumLength(100).When(x => x.Nationality != null);
    }
}

public class ScoreDtoValidator : AbstractValidator<ScoreDto>
{
    /// <summary>
    /// Valida evento de anotación.
    /// </summary>
    /// <remarks>
    /// - <c>Team</c> debe ser HOME o AWAY.
    /// - <c>Points</c> solo 1, 2 o 3.
    /// - <c>PlayerId</c> > 0 si se envía.
    /// - <c>PlayerNumber</c> 0-99 si se envía.
    /// </remarks>
    public ScoreDtoValidator()
    {
        RuleFor(x => x.Team).NotEmpty().Must(t =>
            string.Equals(t, "HOME", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(t, "AWAY", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Team debe ser HOME o AWAY");
        RuleFor(x => x.Points).Must(p => p == 1 || p == 2 || p == 3)
            .WithMessage("Points debe ser 1, 2 o 3");
        RuleFor(x => x.PlayerId).GreaterThan(0).When(x => x.PlayerId.HasValue);
        RuleFor(x => x.PlayerNumber).InclusiveBetween(0, 99).When(x => x.PlayerNumber.HasValue);
    }
}

public class FoulDtoValidator : AbstractValidator<FoulDto>
{
    private static readonly HashSet<string> AllowedFoulTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        nameof(FoulType.PERSONAL),
        nameof(FoulType.TECHNICAL),
        nameof(FoulType.UNSPORTSMANLIKE),
        nameof(FoulType.DISQUALIFYING)
    };

    /// <summary>
    /// Valida registro de falta.
    /// </summary>
    /// <remarks>
    /// - <c>Team</c> HOME/AWAY.
    /// - <c>PlayerId</c> > 0 y <c>PlayerNumber</c> 0-99 si se envían.
    /// - <c>FoulType</c> en catálogo permitido (case-insensitive).
    /// </remarks>
    public FoulDtoValidator()
    {
        RuleFor(x => x.Team).NotEmpty().Must(t =>
            string.Equals(t, "HOME", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(t, "AWAY", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Team debe ser HOME o AWAY");
        RuleFor(x => x.PlayerId).GreaterThan(0).When(x => x.PlayerId.HasValue);
        RuleFor(x => x.PlayerNumber).InclusiveBetween(0, 99).When(x => x.PlayerNumber.HasValue);
        RuleFor(x => x.FoulType).Must(t => string.IsNullOrWhiteSpace(t) || AllowedFoulTypes.Contains(t!))
            .WithMessage("FoulType inválido");
    }
}

public class AdjustScoreDtoValidator : AbstractValidator<AdjustScoreDto>
{
    /// <summary>
    /// Valida ajuste manual de marcador.
    /// </summary>
    /// <remarks>
    /// - <c>HomeDelta</c> y <c>AwayDelta</c> entre -200 y 200.
    /// - Al menos uno distinto de 0.
    /// </remarks>
    public AdjustScoreDtoValidator()
    {
        RuleFor(x => x.HomeDelta).InclusiveBetween(-200, 200);
        RuleFor(x => x.AwayDelta).InclusiveBetween(-200, 200);
        RuleFor(x => x).Must(x => x.HomeDelta != 0 || x.AwayDelta != 0)
            .WithMessage("Al menos uno de los deltas debe ser diferente de 0");
    }
}

public class CreateGameDtoValidator : AbstractValidator<CreateGameDto>
{
    /// <summary>
    /// Valida creación de partido.
    /// </summary>
    /// <remarks>
    /// - <c>Home</c>/<c>Away</c> opcionales; si se envían, 1-50 caracteres.
    /// - Se normalizan nombres por el endpoint en caso de vacío.
    /// </remarks>
    public CreateGameDtoValidator()
    {
        RuleFor(x => x.Home).MinimumLength(1).MaximumLength(50).When(x => !string.IsNullOrWhiteSpace(x.Home));
        RuleFor(x => x.Away).MinimumLength(1).MaximumLength(50).When(x => !string.IsNullOrWhiteSpace(x.Away));
    }
}

public class PairDtoValidator : AbstractValidator<PairDto>
{
    /// <summary>
    /// Valida un emparejamiento Home/Away por identificador.
    /// </summary>
    /// <remarks>
    /// - <c>HomeTeamId</c> y <c>AwayTeamId</c> > 0.
    /// - No se permiten equipos iguales.
    /// </remarks>
    public PairDtoValidator()
    {
        RuleFor(x => x.HomeTeamId).GreaterThan(0);
        RuleFor(x => x.AwayTeamId).GreaterThan(0);
        RuleFor(x => x).Must(x => x.HomeTeamId != x.AwayTeamId)
            .WithMessage("Los equipos no pueden ser iguales");
    }
}

public class ClockDurationDtoValidator : AbstractValidator<ClockDurationDto>
{
    /// <summary>
    /// Valida minutos de duración del cuarto.
    /// </summary>
    /// <remarks>
    /// - <c>Minutes</c> > 0 y <= 60.
    /// </remarks>
    public ClockDurationDtoValidator()
    {
        RuleFor(x => x.Minutes).GreaterThan(0).LessThanOrEqualTo(60);
    }
}

public class ClockResetDtoValidator : AbstractValidator<ClockResetDto>
{
    /// <summary>
    /// Valida reinicio del reloj.
    /// </summary>
    /// <remarks>
    /// - <c>QuarterMs</c> opcional; si se envía, > 0 y <= 60 minutos (en ms).
    /// </remarks>
    public ClockResetDtoValidator()
    {
        RuleFor(x => x.QuarterMs).GreaterThan(0).LessThanOrEqualTo(60 * 60 * 1000).When(x => x.QuarterMs.HasValue);
    }
}

public class GroupCreateDtoValidator : AbstractValidator<GroupCreateDto>
{
    /// <summary>
    /// Valida creación de grupo de torneo.
    /// </summary>
    /// <remarks>
    /// - <c>Name</c> requerido, 2-100.
    /// </remarks>
    public GroupCreateDtoValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2).MaximumLength(100);
    }
}

public class GroupAddTeamDtoValidator : AbstractValidator<GroupAddTeamDto>
{
    /// <summary>
    /// Valida incorporación de equipo al grupo.
    /// </summary>
    /// <remarks>
    /// - <c>TeamId</c> > 0.
    /// </remarks>
    public GroupAddTeamDtoValidator()
    {
        RuleFor(x => x.TeamId).GreaterThan(0);
    }
}

public class GroupScheduleDtoValidator : AbstractValidator<GroupScheduleDto>
{
    /// <summary>
    /// Valida estructura de rondas para calendario por grupos.
    /// </summary>
    /// <remarks>
    /// - <c>Rounds</c> no nulo.
    /// - Cada ronda (lista) valida sus <c>PairDto</c> con <c>PairDtoValidator</c>.
    /// </remarks>
    public GroupScheduleDtoValidator()
    {
        RuleFor(x => x.Rounds).NotNull();
        RuleForEach(x => x.Rounds).NotNull();
        RuleForEach(x => x.Rounds).SetValidator(new RoundValidator());
    }

    private class RoundValidator : AbstractValidator<List<PairDto>>
    {
        public RoundValidator()
        {
            RuleForEach(r => r).SetValidator(new PairDtoValidator());
        }
    }
}
