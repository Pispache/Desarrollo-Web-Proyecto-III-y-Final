# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Aplicación web para gestionar un marcador de baloncesto con control de tiempo, cuartos y faltas.  
La arquitectura utiliza contenedores para la interfaz de usuario (Angular + Nginx), la API (.NET 8) y la base de datos (SQL Server 2022).

Esta aplicacion implementa un sistema completo de marcador de balonceso orientado a su uso en tiempo real durante partidos, con control de reloj de juego , manejo de cuartos, registro de eventos de puntuación y faltas panel de control para el operador, y una vista publica del tablero. 

---
## Arquitectura General 
La arquitectura se divide en trez piezas principales que se comunicacn a través de HTTP en un red de contenedores. La interfaz Angular consume la API REST para consultar el estado del juego actual y registar eventos. La Api persiste el estado en SQL Server , emitiendo reglas de negocio como validaciones de faltas, avance de cuarto al agotar el tiempo y la posibilidad de deshacer eventos. Un contenedor auxiliar inicializa la base con scripts de creación y datos semilla. Esta separación favorece el despliegue y el escalamienot independiente. 

**Flujo de datos de extremo a extremo**
El flujo inicia cuando el operador interactúa con el panel de control. Las acciones como sumar puntos, registrar faltas, iniciar o pausar el reloj se envían a la API mediante peticiones HTTP. La API válida , aplica reglas y almacena los cambios en la base. La vista pública solo renderiza el estado , mientras que el panel de control expone las acciones administrativas. 

## Construcción del Backend 
La API se implementa con minimal APIs , Entity Framework y con DbContext que mapea las entidades principales. El diseño está inpirado en la simplicidad de exponer endopoints pequeños con funciones puras para cada acción del juego y en mantener las transacciones breves para evitar contención. 
A continuación se muestra la estructura del modelo de dominio , este incluye entidades para equipos, juegos y eventos de juego. 

```
public enum GameStatus { Scheduled, Running, Paused, Finished, Cancelled }
public enum FoulType { Personal, Technical, Unsportsmanlike, Disqualifying }
public class Team
{
public int Id { get; set; }
public string Name { get; set; } = string.Empty;
}
public class Game
{
public int Id { get; set; }
public string Home { get; set; } = string.Empty;
public string Away { get; set; } = string.Empty;
public int HomeScore { get; set; }
public int AwayScore { get; set; }
public int Quarter { get; set; } = 1;
public int QuarterSecondsLeft { get; set; } = 10 * 60; // ⬅ reloj por cuarto en segundos
public GameStatus Status { get; set; } = GameStatus.Scheduled;
public List<GameEvent> Events { get; set; } = new();
}
public class GameEvent
{
public long Id { get; set; }
public int GameId { get; set; }
public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
public string Kind { get; set; } = string.Empty; // score, foul, clock, adjust
public string Team { get; set; } = string.Empty; // HOME o AWAY
public int Delta { get; set; } // ⬅ puntos (+/-) o segundos de reloj (+/-)
public FoulType? Foul { get; set; } // ⬅ solo si Kind=="foul"
public string? Note { get; set; }
```


--**DbContext y configuracion de EF Core**
Este centraliza el acceso a tablas y relaciones. Como regla general se configuran índices para consultas por juego y por fecha de evento. 
--**Game**
El modelo Game describe un partido en curso o programado. Contiene atributos como identificador, nombres de equipos, puntaje, estado del juego, cuarto actual y tiempo restante. Es el núcleo del dominio, ya que todo evento depende de un partido específico.
```
public class GameEvent
{
public long Id { get; set; }
public int GameId { get; set; }
public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
public string Kind { get; set; } = string.Empty; // score, foul, clock, adjust
public string Team { get; set; } = string.Empty; // HOME o AWAY
public int Delta { get; set; } // puntos (+/-) o segundos de reloj (+/-)
public FoulType? Foul { get; set; } // solo si Kind=="foul"
public string? Note { get; set; }
}
```
El atributo QuarterSecondsLeft representa el temporizador de juego por cuarto y permite avanzar automáticamente al siguiente cuando llega a cero. La lista Events mantiene un historial de todos los sucesos que modifican el estado.

-- **GameEvent**

El modelo GameEvent es la bitácora de lo ocurrido durante un partido. Cada anotación, falta, ajuste manual o cambio de reloj queda registrado aquí, con un identificador, una marca de tiempo y detalles del tipo de evento.
```
public class GameEvent
{
public long Id { get; set; }
public int GameId { get; set; }
public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
public string Kind { get; set; } = string.Empty; // score, foul, clock, adjust
public string Team { get; set; } = string.Empty; // HOME o AWAY
public int Delta { get; set; } // puntos (+/-) o segundos de reloj (+/-)
public FoulType? Foul { get; set; } // solo si Kind=="foul"
public string? Note { get; set; }
}
```
Aquí Kind indica el tipo de suceso (por ejemplo, un puntaje o una falta). Delta se usa para indicar cuánto cambió el marcador o el reloj. Gracias a este modelo, es posible reconstruir toda la historia de un partido e incluso deshacer el último evento.El modelo **Team** representa un equipo registrado en el sistema. Permite mantener un catálogo de equipos y asociarlos a partidos, evitando inconsistencias al usar solo cadenas de texto.

-- **Endpoints principales**
Los endpoints son las rutas HTTP que exponen la funcionalidad de la API. Cada uno corresponde a una acción concreta dentro del dominio del partido y se implementa con Minimal APIs en .NET 8. La lógica de negocio se encapsula en cada operación, garantizando que el estado del juego se mantenga consistente

 **/health**
 Este endpoint se utiliza para verificar la salud del servicio. Devuelve un objeto JSON simple que indica si la API está disponible.

```
 GET /health
```
**/api/games**
Permite listar todos los partidos registrados en la base de datos o crear uno nuevo.
```
GET /api/games devuelve la lista de partidos.
POST /api/games crea un partido nuevo, inicializando estado, cuarto y reloj.
```
**/api/games/{id}/score**

Registra una anotación de puntos para un equipo específico. Se envía el identificador del partido y se especifican el equipo y los puntos.

```
POST /api/games/1/score
{
"team": "HOME",
"points": 3
}
```
Con estos endpoints, la API proporciona un conjunto completo de operaciones para gestionar un partido: desde la creación hasta la anotación de puntos, control del tiempo, registro de faltas y corrección de errores. Cada uno encapsula una regla de negocio fundamental, lo que permite mantener un flujo de juego consistente y auditable.


**Reglas de negocio y consistencia**

La API debe garantizar que el marcador no sea negativo al deshacer o ajustar manualmente, que el reloj nunca quede por debajo de cero y que el avance de cuarto se produzca exactamente cuando el tiempo llega a cero, restableciendo el reloj al valor configurado por cuarto. Se recomienda encapsular estas reglas en servicios de dominio para facilitar pruebas, y mantener eventos inmutables para una auditable línea de tiempo de lo ocurrido.

## Base de datos — SQL Server 2022

La base usa tablas para juegos y eventos, y opcionalmente una tabla de equipos cuando se administra un catálogo. Un esquema representativo incluye claves primarias enteras autoincrementales, foráneas entre eventos y juegos, índices compuestos por juego y marca de tiempo, y valores calculados para consultas rápidas de puntaje.
```
CREATE TABLE Games (
  Id INT IDENTITY PRIMARY KEY,
  Home NVARCHAR(100) NOT NULL,
  Away NVARCHAR(100) NOT NULL,
  HomeScore INT NOT NULL DEFAULT 0,
  AwayScore INT NOT NULL DEFAULT 0,
  Quarter INT NOT NULL DEFAULT 1,
  QuarterSecondsLeft INT NOT NULL DEFAULT 600,
  Status INT NOT NULL DEFAULT 0
);

CREATE TABLE GameEvents (
  Id BIGINT IDENTITY PRIMARY KEY,
  GameId INT NOT NULL,
  At DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  Kind NVARCHAR(30) NOT NULL,
  Team NVARCHAR(10) NOT NULL,
  Delta INT NOT NULL,
  Foul INT NULL,
  Note NVARCHAR(200) NULL,
  CONSTRAINT FK_GameEvents_Games FOREIGN KEY (GameId) REFERENCES Games(Id)
);
```
## Requisitos previos

1. Docker y Docker Compose v2  
   - Windows: Docker Desktop con WSL2 habilitado.  
   - Linux: Docker Engine y complemento de docker compose.  
2. Git instalado.

---
## Instalación y ejecución

### 1. Clonar el repositorio
```bash
git clone https://github.com/CesarTecun/Marcador-de-baloncesto.git
cd Marcador-de-baloncesto
2. Configurar variables de entorno

Crear un archivo .env en la raíz con el siguiente contenido:

SA_PASSWORD=proyectoweb2025!
ASPNETCORE_URLS=http://0.0.0.0:8080
DB_NAME=MarcadorDB

La contraseña debe cumplir los requisitos de SQL Server (mayúsculas, minúsculas, dígitos y símbolo).
3. Levantar la aplicación con Docker Compose

Para iniciar todos los servicios:

docker compose --profile all up --build

Acceso a los servicios

    Interfaz de usuario: http://localhost:4200

    API: http://localhost:8080/health

    Base de datos SQL Server: localhost,1433 (usuario sa, contraseña definida en .env)

Descripción de servicios

    db: Servidor SQL Server 2022.

    db_init: Ejecuta los scripts db/init.sql y db/seed.sql para crear y poblar la base de datos.

    api: API desarrollada en .NET 8, expuesta en el puerto 8080.

    ui: Aplicación Angular compilada y servida con Nginx en el puerto 4200.

Estructura del proyecto
.
├─ api/                 # API en .NET 8
├─ ui/                  # Frontend Angular + Nginx
├─ db/                  # Scripts de base de datos
│  ├─ init.sql
│  └─ seed.sql
├─ scripts/             # Scripts auxiliares
├─ docker-compose.yml
├─ .env                 # Variables de entorno
└─ docs/
   └─ README.md

Pruebas de la API
Con el sistema en ejecución:
# Verificar estado
curl http://localhost:8080/health

# Listar juegos
curl http://localhost:8080/api/games

# Crear un juego
curl -X POST http://localhost:8080/api/games \
  -H "Content-Type: application/json" \
  -d '{"home":"Leones","away":"Panteras"}'

Desarrollo local (opcional)

    Ejecutar solo la interfaz: comentar el bloque /api/ en ui/nginx.conf y reconstruir el contenedor.

    Ejecutar la API fuera de Docker: ejecutar dotnet run en el directorio api/ y ajustar la configuración de Nginx para apuntar a host.docker.internal:8080 (o a la IP del host en Linux).

Detener y limpiar

# Detener contenedores
docker compose down

# Detener y eliminar volúmenes (borra datos de la base)
docker compose down -v

Solución de problemas

    Error "host not found in upstream 'api'": levantar la API junto con la UI o desactivar el proxy /api/ en ui/nginx.conf.

    Error de contraseña en SQL Server: modificar SA_PASSWORD en .env asegurando que cumpla con la política de seguridad.

    Fallo en instalación de dependencias de Angular: regenerar package-lock.json y reconstruir la imagen.
