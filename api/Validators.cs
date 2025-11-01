using System;
using System.Collections.Generic;
using FluentValidation;

public class TeamUpsertDtoValidator : AbstractValidator<TeamUpsertDto>
{
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
    public CreateGameDtoValidator()
    {
        RuleFor(x => x.Home).MinimumLength(1).MaximumLength(50).When(x => !string.IsNullOrWhiteSpace(x.Home));
        RuleFor(x => x.Away).MinimumLength(1).MaximumLength(50).When(x => !string.IsNullOrWhiteSpace(x.Away));
    }
}

public class PairDtoValidator : AbstractValidator<PairDto>
{
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
    public ClockDurationDtoValidator()
    {
        RuleFor(x => x.Minutes).GreaterThan(0).LessThanOrEqualTo(60);
    }
}

public class ClockResetDtoValidator : AbstractValidator<ClockResetDto>
{
    public ClockResetDtoValidator()
    {
        RuleFor(x => x.QuarterMs).GreaterThan(0).LessThanOrEqualTo(60 * 60 * 1000).When(x => x.QuarterMs.HasValue);
    }
}

public class GroupCreateDtoValidator : AbstractValidator<GroupCreateDto>
{
    public GroupCreateDtoValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2).MaximumLength(100);
    }
}

public class GroupAddTeamDtoValidator : AbstractValidator<GroupAddTeamDto>
{
    public GroupAddTeamDtoValidator()
    {
        RuleFor(x => x.TeamId).GreaterThan(0);
    }
}

public class GroupScheduleDtoValidator : AbstractValidator<GroupScheduleDto>
{
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
