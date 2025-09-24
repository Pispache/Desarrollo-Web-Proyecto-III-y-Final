public enum FoulType
{
    PERSONAL,
    TECHNICAL,
    UNSPORTSMANLIKE,
    DISQUALIFYING
}

// DTOs
public record CreateGameDto(string? Home, string? Away);
public record TeamCreateDto(string Name);
public record TeamUpsertDto(string Name, string? City, string? LogoUrl);
public record TeamDto(int TeamId, string Name, string? City, string? LogoUrl, DateTime CreatedAt);
public record PairDto(int HomeTeamId, int AwayTeamId);
public record CreatePlayerDto(string Name, byte? Number, string? Position, int? HeightCm, int? Age, string? Nationality);
public record UpdatePlayerDto(byte? Number, string? Name, string? Position, bool? Active, int? HeightCm, int? Age, string? Nationality);
public record ClockResetDto(int? QuarterMs);
