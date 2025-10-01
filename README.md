# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)
LINK DEL LA APLICACION
https://tobarumg.lat/login

IP clave SSH: ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237
IP publica: 167.172.214.237

Aplicación web para gestionar un marcador de baloncesto con control de tiempo, cuartos y faltas.  
La arquitectura utiliza contenedores para la interfaz de usuario (Angular + Nginx), la API (.NET 8) y la base de datos (SQL Server 2022).

Esta aplicacion implementa un sistema completo de marcador de balonceso orientado a su uso en tiempo real durante partidos, con control de reloj de juego , manejo de cuartos, registro de eventos de puntuación y faltas panel de control para el operador, y una vista publica del tablero. 

---
## Arquitectura General 
La arquitectura se divide en trez piezas principales que se comunicacn a través de HTTP en un red de contenedores. La interfaz Angular consume la API REST para consultar el estado del juego actual y registar eventos. La Api persiste el estado en SQL Server , emitiendo reglas de negocio como validaciones de faltas, avance de cuarto al agotar el tiempo y la posibilidad de deshacer eventos. Un contenedor auxiliar inicializa la base con scripts de creación y datos semilla. Esta separación favorece el despliegue y el escalonamiento independiente. 

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
## Frontend
La interfaz se compone de una vista del tablero y un panel de control operativo. El tablero muestra nombre de equipos, tanteador, cuarto y un reloj prominente. El panel de control permite sumar o restar puntos, registrar faltas, iniciar o pausar el reloj y avanzar manualmente de cuarto si fuese necesario. La comunicación con la API se realiza a través de un servicio HTTP concentrado, y el despliegue productivo lo sirve Nginx como contenido estático con un proxy inverso para las rutas /api dirigidas al contenedor de la API.

-- **Servicio de datos en Angular**

El servicio centraliza las peticiones a la API y maneja serialización tipada. Un ejemplo de implementación es el siguiente:

```
@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = '/api'; // ⬅ Nginx proxy a la API
  constructor(private http: HttpClient) {}
  health() { return this.http.get<{status:string}>(`${this.base}/../health`); }
  listGames() { return this.http.get<Game[]>(`${this.base}/games`); }
  createGame(home: string, away: string) { return this.http.post<Game>(`${this.base}/games`, { home, away }); }
  score(id: number, team: 'HOME'|'AWAY', points: number) { return this.http.post<Game>(`${this.base}/games/${id}/score`, { team, points }); }
  foul(id: number, team: 'HOME'|'AWAY', foul: FoulType) { return this.http.post(`${this.base}/games/${id}/foul`, { team, foul }); }
  clock(id: number, delta: number) { return this.http.post<Game>(`${this.base}/games/${id}/clock`, { delta }); }
  undo(id: number) { return this.http.post<Game>(`${this.base}/games/${id}/undo`, {}); }
}
```
La vista de tablero (Display) consume el estado del juego y lo renderiza con fuentes de alto contraste y distribución responsive. El panel de control (Control Panel) expone botones grandes y claramente diferenciados para operaciones frecuentes, usa formularios reactivos o template‑driven con [(ngModel)] para el binding y da retroalimentación visual inmediata al operador tras cada acción. La composición en Angular debe separar presentación y orquestación, colocar la lógica de negocio en servicios y mantener los componentes altamente declarativos. El contenedor de la UI compila Angular en modo producción y Nginx sirve el contenido estático, además de reenviar /api/* a la API.

## Despliegue con Docker Compose
El despliegue con Docker Compose orquesta cuatro servicios: la base de datos SQL Server, un contenedor de inicialización de la base que ejecuta scripts de creación y semilla, la API .NET que expone el puerto 8080 y la UI con Nginx publicada en el 4200. Las variables de entorno principales se declaran en un archivo .env en la raíz del proyecto y se consumen desde los servicios, incluyendo la contraseña del usuario sa, la URL de escucha de ASP.NET y el nombre de la base. Durante el levantamiento se construyen las imágenes de UI y API a partir de sus Dockerfiles, y los volúmenes de la base persisten los datos entre ejecuciones. El archivo .env esperado contiene las tres variables críticas comentadas en la configuración y debe cumplir la política de contraseñas complejas de SQL Server, que exige mayúsculas, minúsculas, dígitos y símbolos. Un ejemplo de contenido es este:

```
SA_PASSWORD=Proyect0Web2025!
ASPNETCORE_URLS=http://0.0.0.0:8080
DB_NAME=MarcadorDB
```
Durante el desarrollo es habitual levantar la API fuera de Docker con dotnet run desde la carpeta del proyecto de la API y apuntar Nginx al host del desarrollador. Para ello, en el nginx.conf de la UI el bloque del proxy /api puede reconfigurarse temporalmente para enviar el tráfico a host.docker.internal:8080 en Windows y macOS o a la IP del host en Linux. La interfaz Angular también puede ejecutarse en modo desarrollo con ng serve y comunicarse con la API local si se ajusta la variable base del servicio.

## Requisitos mínimos de ejecución
A pesar del uso de docker , la host machine debe cumplir con algunos requisitos mínimos para funcionar correctamente, los cuales se describen a continuación:

**Windows 10/11 (x64) con WSL2**
```
Docker Desktop 4.31+ con WSL2 habilitado.
CPU: 4 núcleos (mínimo).
RAM: 8 GB (mínimo); 16 GB recomendado porque SQL Server en contenedor es exigente.
Disco: 10–15 GB libres para imágenes/volúmenes.
```
**Linux (Ubuntu 22.04+ / Debian 12+ / Fedora 39+)**

```
Docker Engine 24+ y docker compose v2 (plugin oficial).
CPU: 4 núcleos.
RAM: 8 GB mínimo (16 GB recomendado).
Disco: 10–15 GB libres.
```
**macOS 12+ (Monterey o superior)**

```
Docker Desktop 4.31+. En Apple Silicon (M1/M2/M3), SQL Server oficial corre en x86_64; Docker usa emulación, por lo que 16 GB RAM es muy recomendable.
CPU: Apple Silicon (M1/M2/M3) o Intel i5/i7.
RAM: 8 GB mínimo (16 GB recomendado por SQL Server).
Disco: 10–15 GB libres.
```

## Observabilidad, registros y auditoría

El registro de eventos de juego funciona como fuente de verdad histórica y permite construir un timeline auditable. Se recomienda incrementar la observabilidad con logs estructurados en la API, trazas de solicitudes y respuestas importantes, y un identificador correlativo por partido. En producción, Nginx debe registrar accesos y errores en archivos rotados, y la base utilizar integridad referencial para evitar huérfanos.

## Errores comunes y solución de problemas

Si Nginx no puede resolver api como upstream, es señal de que el servicio de la API no está levantado en la red de Docker o el proxy no está activado con la configuración adecuada. El error habitual “host not found in upstream 'api'” se soluciona levantando la API junto con la UI o deshabilitando temporalmente el bloque del proxy cuando se desarrolla solo la interfaz. La contraseña del usuario sa de SQL Server debe cumplir las políticas de seguridad; si la base no inicia y se registran errores de autenticación, es necesario regenerar la variable con un valor fuerte. Si falla la instalación de dependencias de Angular dentro del contenedor, suele bastar con regenerar package-lock.json y reconstruir la imagen.

## Limitaciones y consideraciones de diseño

El reloj del partido corre en el cliente por diseño para ofrecer latencia cero a la vista del operador; si el navegador pierde foco o se suspende, podría sufrir micro desincronizaciones que deben corregirse con un pulso de sincronización desde la API o con recalibraciones al registrar cada evento. En equipos de bajo rendimiento o con múltiples contenedores la experiencia puede degradar; es recomendable asignar memoria y CPU suficientes en Docker Desktop. La seguridad por defecto es básica y se debe fortalecer con autenticación y autorización si la aplicación se publica en redes abiertas. No se incluyen pruebas automatizadas de extremo a extremo; añadirlas incrementaría la confiabilidad del flujo de anotación.

## Extensiones y mejoras futuras

Una evolución natural es sustituir el polling por WebSockets o SignalR para actualizaciones en tiempo real, ofrecer un modo de espectador optimizado separado de la consola de operación, mantener un resumen por cuarto con lógica de bonus de faltas, crear exportaciones a PDF o Excel de estadísticas y agregar accesibilidad mediante atajos de teclado y controles de alto contraste. Integrar almacenamiento de configuraciones del partido, rosters y cronometría personalizable por competición también aportaría valor.

## Mantenimiento y operación

En operación se recomienda separar volúmenes de datos de SQL Server para facilitar respaldos, y versionar los scripts de inicialización. Para cambios en el modelo de datos, las migraciones de EF Core documentan la evolución del esquema. Es conveniente adoptar un control de versiones semántico para la API y etiquetar imágenes de Docker con el número de versión. El monitoreo de salud con /health habilita integraciones con orquestadores o pipelines CI para verificar despliegues.

Para esta versión del proyecto se utilizaron las siguientes herramimientas , las cuales se muestran a continuación:
```
**Backend (API)**
Runtime/SDK: .NET 8.x (ASP.NET Core 8) 
EF Core: 8.x 

**Base de datos**
SQL Server 2022 (imagen “2022-latest” en Docker). 

**Frontend**
Angular  20.2.0
Nginx (imagen estable típica)
```
## Autores
Cesar Alberto Tecún Leiva 7690-22-11766

Jose Daniel Tobar Reyes 7690-21-13125

Bryan Manuel Pineda Orozco 7690-16-8869

Grupo #8

Tabla de trabajo:

**## Distribución de Trabajo

| Integrante                    | Responsabilidades                                                                                                        | Porcentaje |

| **Cesar Alberto Tecún Leiva** | Implementación de **Login con JWT**, autenticación, retoques y corrección de bugs en el frontend (Angular).              | 33.3% |
| **Jose Daniel Tobar Reyes**   | Desarrollo de torneos (frontend y backend), funciones de backend para editar y agregar jugadores, configuración del VPS. | 33.3% |
| **Bryan Manuel Pineda Orozco**| Implementación y diseño **navbar responsive**, corrección de bugs en frontend, módulos de jugadores y equipos.           | 33.3% |


**
