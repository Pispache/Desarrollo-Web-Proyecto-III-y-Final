# ADR: Microservicio de Reportes con FastAPI + Postgres + Puppeteer

## Decisión
- Backend de reportes en Python (FastAPI).
- Base de datos de reportes en Postgres (lectura para report-service; escritura por ETL).
- Mantener API .NET existente (emisor de JWT y funcionalidad core).
- ETL incremental desde SQL Server → Postgres (upsert por IDs/CreatedAt).
- Renderizado de PDF vía HTML-to-PDF usando servicio auxiliar con Puppeteer (Chromium).
- Se conserva el contrato JWT actual: `iss`, `aud`, `exp`, y `role=ADMIN`.

## Contexto
El repositorio actual orquesta SQL Server, API .NET y UI Angular. Se requiere desacoplar reportes en un microservicio independiente con otra tecnología y base de datos, sin alterar el flujo de autenticación existente.

## Alcance (Fase 0)
- Definir servicios nuevos en `docker-compose.yml`: `postgres`, `report-service`, `pdf-renderer`, `etl` (placeholder).
- Scaffold mínimo de `report-service` con `/health` 200.
- Documentación y variables de entorno necesarias.

## Endpoints del report-service (futuro Fase 3)
- `GET /v1/reports/teams.pdf?q=&city=&page=&pageSize=`
- `GET /v1/reports/teams/{teamId}/players.pdf`
- `GET /v1/reports/games.pdf?from=&to=&status=`

## JWT
- Validación en report-service: `iss`, `aud`, `exp` y `role=ADMIN`.
- Variables de entorno compartidas: `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`.

## Datos
- Postgres (data mart) con tablas: `teams`, `players`, `games`, `game_events`, (más `game_roster_entries` en Fase 4).
- Índices para filtros: `games(status, created_at)`, `game_events(game_id, event_type, player_id)`, `players(team_id)`.
- ETL incremental contenedor Python con upsert por `CreatedAt`/IDs.

## PDF
- Servicio `pdf-renderer` (Node) que recibe HTML y devuelve PDF con Puppeteer.
- Encabezado con `SYSTEM_LOGO_URL`, fecha y filtros; numeración de páginas.

## Criterios de Aceptación (Fase 0)
- `docker compose --profile reports up -d` levanta `postgres` y `report-service`.
- `GET http://localhost:8081/health` responde 200.

## Fase 1: Esquemas y ETL (Implementado)

### DDL Postgres
- Archivos: `db/pg/ddl.sql` y `db/pg/init.sql`
- Tablas: `teams`, `players`, `games`, `game_events`, `game_roster_entries`, `etl_state`
- Indices: `games(status, created_at)`, `game_events(game_id, event_type)`, `players(team_id)`
- Roles: `report_ro` (lectura), `etl_writer` (escritura), `reports_admin` (admin)

### ETL
- Archivo: `etl/main.py`
- Sincroniza Teams, Players, Games, GameEvents desde SQL Server
- Upsert por clave primaria (ON CONFLICT DO UPDATE)
- Checkpoints en tabla `etl_state`
- Logs con conteos y duracion
- Intervalo configurable (default 120s)

### Inicializacion
- Script `db/pg/init.sql` se ejecuta automaticamente
- Crea tablas, indices, roles y checkpoints
- Montado en `/docker-entrypoint-initdb.d/`

### Variables
```env
POSTGRES_USER=reports_admin
POSTGRES_PASSWORD=reports_admin_pwd
POSTGRES_DB=reportsdb
ETL_INTERVAL_SECONDS=120
```

### Verificacion
```bash
# Levantar servicios
docker compose --profile reports up -d

# Ver logs
docker logs -f marcador_etl

# Verificar datos
./scripts/verify-etl.sh
```

## Riesgos y Mitigaciones
- Coste de Chromium: aislar en `pdf-renderer` para evitar impactar al report-service.
- Sincronización: ETL con checkpoints por tabla (implementado).
- Volumen de datos: Índices optimizados para consultas de reportes.
- Errores de conexión: Logs detallados y reintentos automáticos.

## Referencias
- JWT existente en `.NET`: `api/AuthEndpoints.cs`, `api/Program.cs`.
- SQL Server schema: `db/init.sql`
- ETL implementation: `etl/main.py`
