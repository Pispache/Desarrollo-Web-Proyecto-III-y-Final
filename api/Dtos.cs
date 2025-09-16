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
public record PairDto(int HomeTeamId, int AwayTeamId);
public record CreatePlayerDto(string Name, byte? Number, string? Position);
public record UpdatePlayerDto(byte? Number, string? Name, string? Position, bool? Active);
public record ClockResetDto(int? QuarterMs);
