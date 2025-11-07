# Guía del Proyecto

Esta guía resume la estructura actual del repositorio, perfiles de Docker Compose, puertos, comandos útiles y variables de entorno.

## Estructura del repositorio

```
.
├── backend-api/
│   └── api/                     # API ASP.NET Core 8
├── backend-auth-service/
│   └── auth-service/            # Microservicio de autenticación (Node.js + MongoDB)
├── backend-reports/
│   └── reports/                 # Microservicio de reportes (Python/FastAPI)
├── frontend/
│   └── ui/                      # Frontend Angular (build vía Nginx)
├── infra/
│   ├── db/                      # Archivos DB (SQL Server, Postgres)
│   │   └── pg/                  # Init/migraciones de Postgres
│   ├── deploy/                  # Configuración de despliegue (nginx, etc.)
│   ├── jobs/
│   │   └── etl/                 # Job ETL (Python)
│   ├── scripts/                 # Scripts genéricos (montados en contenedores)
│   └── services/
│       └── pdf-renderer/        # Servicio utilitario de render PDF (Node + Puppeteer)
├── docs/                        # Manuales y documentación
├── docker-compose.yml           # Orquestación principal (perfiles)
├── docker-compose.override.yml  # Overrides locales (auth, etc.)
├── .env                         # Variables de entorno (no subir)
└── users.json                   # Usuarios admin iniciales para API
```

## Perfiles de Docker Compose

- db: SQL Server + inicialización (`db` y `db_init`)
- api: API .NET 8
- ui: Frontend Angular (Nginx)
- auth: MongoDB + Auth Service
- reports: Postgres + Report Service + PDF Renderer + ETL
- all: todo el stack

## Puertos (host → contenedor)

- API (.NET): 127.0.0.1:8080 → 8080
- UI (Nginx): 127.0.0.1:4200 → 80
- Auth Service: 127.0.0.1:5001 → 5000
- MongoDB: 127.0.0.1:27017 → 27017
- Report Service (FastAPI): 127.0.0.1:8081 → 8081
- PDF Renderer: 127.0.0.1:3001 → 3000
- SQL Server: 127.0.0.1:1435 → 1435
- Postgres: 127.0.0.1:5432 → 5432

## Comandos

Construir todo:

```bash
docker compose build
```

Levantar todo:

```bash
docker compose up -d --profile all
```

Levantar por dominio:

```bash
# Backend principal (DB + API + UI)
docker compose up -d --profile db --profile api --profile ui

# Autenticación
docker compose up -d --profile auth

# Reportes (Postgres, Report Service, PDF, ETL)
docker compose up -d --profile reports
```

Logs y apagado:

```bash
docker compose logs -f api
docker compose down
```

## Variables de entorno (resumen)

Archivo `.env` en la raíz. Revisa `docker-compose.yml` para el detalle.

- API
  - ASPNETCORE_URLS, JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, JWT_EXPIRES_MINUTES
  - DB_NAME, SA_PASSWORD (para connection string), ADMIN_USERNAME, ADMIN_PASSWORD
- Auth Service
  - MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN
  - GOOGLE_CLIENT_ID/SECRET, FACEBOOK_APP_ID/SECRET, GITHUB_CLIENT_ID/SECRET
  - FRONTEND_URL, CORS_ORIGIN, SESSION_SECRET
- Reports / ETL
  - POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
  - PDF_RENDERER_URL, ETL_INTERVAL_SECONDS, MSSQL_CS, POSTGRES_CS

## Volúmenes relevantes

- ./infra/scripts:/scripts (db_init)
- ./infra/db:/db (archivos de base de datos e inicialización)
- ./backend-api/api/wwwroot:/app/wwwroot (estáticos API)
- ./users.json:/app/users.json:ro (usuarios admin iniciales API)

## Endpoints locales

- UI: http://localhost:4200
- API: http://localhost:8080
- Auth: http://localhost:5001/api/health
- Reports: http://localhost:8081/health
- PDF Renderer: http://localhost:3001/health

## Organización de scripts (.sh)

- infra/scripts/: scripts genéricos montados por compose (p.ej., db-init.sh, espera_sql.sh)
- infra/db/pg/: scripts SQL y utilidades específicas de Postgres (p.ej., migrate.sh, init.sql)
- infra/jobs/etl/scripts/: scripts específicos del ETL (p.ej., run-etl-once.sh, verify-etl.sh)

## Notas

- Mantener `frontend/ui/src/` y configuración Angular sin cambios internos.
- Evitar secretos en README; usa `.env` o gestores de secretos.
- Para Windows, usa PowerShell o Git Bash (LF recomendado para scripts).
