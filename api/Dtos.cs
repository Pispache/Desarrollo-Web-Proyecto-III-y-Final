/// <summary>
/// Tipos de faltas que se pueden registrar en un partido de baloncesto.
/// </summary>
/// <remarks>
/// Permite clasificar las infracciones cometidas durante el juego:
/// - PERSONAL: Falta común cometida por contacto.
/// - TECHNICAL: Falta técnica por conducta inapropiada.
/// - UNSPORTSMANLIKE: Falta antideportiva por juego brusco.
/// - DISQUALIFYING: Falta grave que provoca la expulsión del jugador.
/// </remarks>
public enum FoulType
{
    PERSONAL,
    TECHNICAL,
    UNSPORTSMANLIKE,
    DISQUALIFYING
}

/// <summary>
/// Información para crear un nuevo juego.
/// </summary>
/// <remarks>
/// Se usa para iniciar un partido especificando el nombre del equipo local y visitante.
/// Si no se indica, se asignan nombres predeterminados como “Local” y “Visitante”.
/// </remarks>
public record CreateGameDto(string? Home, string? Away);

/// <summary>
/// Datos básicos para registrar un equipo.
/// </summary>
/// <remarks>
/// Permite crear un equipo indicando únicamente su nombre.
/// </remarks>
public record TeamCreateDto(string Name);

/// <summary>
/// Datos para crear o actualizar un equipo existente.
/// </summary>
/// <remarks>
/// Incluye nombre, ciudad y el enlace a su logo.
/// Se utiliza al registrar un nuevo equipo o al modificar su información.
/// </remarks>
public record TeamUpsertDto(string Name, string? City, string? LogoUrl);

/// <summary>
/// Representa la información pública de un equipo.
/// </summary>
/// <remarks>
/// Contiene su identificador, nombre, ciudad, dirección del logo y fecha de creación.
/// Es la estructura que se devuelve al consultar un equipo.
/// </remarks>
public record TeamDto(int TeamId, string Name, string? City, string? LogoUrl, DateTime CreatedAt);

/// <summary>
/// Datos para enfrentar a dos equipos en un partido.
/// </summary>
/// <remarks>
/// Indica los identificadores de los equipos que jugarán como local y visitante.
/// </remarks>
public record PairDto(int HomeTeamId, int AwayTeamId);

/// <summary>
/// Información para agregar un nuevo jugador a un equipo.
/// </summary>
/// <remarks>
/// Incluye datos como nombre, número de camiseta, posición, estatura, edad y nacionalidad.
/// </remarks>
public record CreatePlayerDto(
    string Name,
    byte? Number,
    string? Position,
    int? HeightCm,
    int? Age,
    string? Nationality
);

///
