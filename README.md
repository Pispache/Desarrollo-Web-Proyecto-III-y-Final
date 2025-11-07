# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Proyecto Final - Desarrollo Web  
Aplicación web para gestionar un marcador de baloncesto en tiempo real con control de reloj, cuartos, puntuación, faltas, deshacer eventos y vista pública.

**Producción:** https://tobarumg.lat/login  
**SSH:** `ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237`  
**IP Pública:** `167.172.214.237`

---
### Documentación Principal
- [Manual de Usuario (PDF)](docs/Fase%20final,%20Manual%20de%20Usuario.pdf)
- [Manual Técnico (PDF)](docs/Fase%20Final,%20Manual%20Técnico.pdf)
- [Manual de Usuario (Web)](docs/manual_usuario.md)
- [Guía del Proyecto](docs/guia-proyecto.md)

### Documentación Técnica
- [Documentación de Seguridad OWASP](docs/security.md)
- [Notas de Despliegue](docs/deploy-notes.md)
 
> Nota: La carpeta `docs/` contiene la documentación técnica completa del proyecto (diagramas, ADRs, manuales y especificaciones). Puedes acceder al [índice completo de documentación](docs/README.md) para ver todos los recursos disponibles.

---

## Índice

| Sección | Enlace |
|--------|--------|
| Documentación técnica (docs) | [Índice de documentación](docs/README.md) |
| 1. Descripción General | [Click aquí para ir a la sección](#descripción-general) |
| 2. Arquitectura General | [Click aquí para ir a la sección](#arquitectura-general) |
| 3. Backend (.NET 8) | [Click aquí para ir a la sección](#construcción-del-backend) |
| 4. Base de Datos | [Click aquí para ir a la sección](#base-de-datos---sql-server-2022---mongo) |
| 5. Frontend (Angular) | [Click aquí para ir a la sección](#frontend) |
| 6. Docker & Deployment | [Click aquí para ir a la sección](#despliegue-con-docker-compose) |
| 7. Requisitos del Sistema | [Click aquí para ir a la sección](#requisitos-mínimos-de-ejecución) |
| 8. Observabilidad / Auditoría | [Click aquí para ir a la sección](#observabilidad-registros-y-auditoría) |
| 9. Errores Comunes | [Click aquí para ir a la sección](#errores-comunes-y-solución-de-problemas) |
| 10. Limitaciones | [Click aquí para ir a la sección](#limitaciones-y-consideraciones-de-diseño) |
| 11. Mejoras Futuras | [Click aquí para ir a la sección](#extensiones-y-mejoras-futuras) |
| 12. Mantenimiento | [Click aquí para ir a la sección](#mantenimiento-y-operación) |
| 13. Herramientas Utilizadas | [Click aquí para ir a la sección](#herramientas-utilizadas) |
| 14. Autores | [Click aquí para ir a la sección](#autores) |

---

## Descripción General

Sistema web completo para la gestión y visualización de marcadores de baloncesto en tiempo real, diseñado para torneos y partidos oficiales. La aplicación ofrece una experiencia profesional tanto para operadores como para espectadores.

### Características Principales

- **Gestión de Tiempo**
  - Control preciso del reloj por cuarto
  - Pausas automáticas y manuales
  - Configuración de duración de cuartos
  - Manejo de tiempos fuera

- **Control de Puntuación**
  - Registro instantáneo de canastas (1, 2 y 3 puntos)
  - Seguimiento de faltas por jugador y equipo
  - Sistema de bonus por cuarto
  - Historial de eventos con opción de deshacer

- **Interfaz Dual**
  - Panel de control para operadores con todas las funciones
  - Vista pública optimizada para proyección y streaming
  - Diseño responsivo para cualquier dispositivo
  - Modo oscuro/claro integrado

- **Gestión de Torneos**
  - Creación y administración de torneos
  - Registro de equipos y jugadores
  - Programación de partidos
  - Estadísticas y reportes

- **Características Técnicas**
  - Actualización en tiempo real con SignalR
  - Autenticación segura con OAuth 2.0
  - API RESTful documentada
  - Logs y auditoría completa
- Eventos auditables y consistentes  

---

## Arquitectura General

Sistema dividido en tres piezas principales:

- Angular + Nginx — UI y tablero  
- .NET 8 Minimal API — lógica del juego  
- SQL Server 2022 — persistencia  

Flujo:  
UI → API → BD → UI

### Tabla de servicios

| Servicio / Componente | Lenguaje / Framework | Base de datos (local) | Puerto (host -> container) | Observaciones |
|----------------------|---------------------|----------------------:|:----------------------------:|---------------|
| `marcador_api` (API) | C# (.NET 8) - Minimal API | SQL Server 2022 | `127.0.0.1:8080:8080` | Lógica del marcador, endpoints `/api/*` |
| `marcador_ui` (UI) | Angular (compilada) + Nginx | N/A (static) | `127.0.0.1:4200:80` | Interfaz y proxy a la API (`/api`) |
| `marcador_db` (SQL Server) | MS SQL Server 2022 | SQL Server 2022 | `127.0.0.1:1435:1435` | Persistencia principal (Games, Teams, Events) |
| `marcador_auth` (Auth Service) | Node.js (Express / Passport) | MongoDB | `127.0.0.1:5001:5000` | OAuth2 providers (Google/GitHub/Facebook), JWT issuance |
| `marcador_mongodb` (MongoDB) | MongoDB 7 | MongoDB | `127.0.0.1:27017:27017` | Usuarios/sesiones del Auth Service |
| `marcador_pg` (Postgres) | PostgreSQL 16 | PostgreSQL | `127.0.0.1:5432:5432` | Datos de reportes / ETL destino |
| `marcador_reports` (Report Service) | Python FastAPI | PostgreSQL + Mongo (configurable) | `127.0.0.1:8081:8081` | Generación de reportes (PDF/CSV) |
| `marcador_pdf` (PDF Renderer) | Node.js + Puppeteer | N/A | `127.0.0.1:3001:3000` | Renderizado de PDFs (Puppeteer) |
| `marcador_etl` (ETL) | Python (scripts) | SQL Server / Postgres | (internal) | Tareas de extracción y consolidación; no expone puerto por defecto |

> Nota: Los puertos están mapeados a `127.0.0.1` en docker-compose por seguridad. Algunos servicios internos (intra-network) usan puertos distintos dentro de la red de Docker.

---

## Construcción del Backend

El backend está construido sobre .NET 8 utilizando el enfoque de Minimal APIs para una arquitectura ligera y eficiente.

### Tecnologías Principales

- **ASP.NET Core 8**
  - Minimal APIs para endpoints REST
  - SignalR para comunicación en tiempo real
  - Middleware personalizado para autenticación
  - Filtros de validación y excepciones

- **Entity Framework Core**
  - Code-First approach con migraciones
  - Configuración fluent para modelos
  - Optimización de consultas con tracking selectivo
  - Unit of Work pattern implementado

- **Modelos de Datos**
  ```csharp
  DbContext
  ├── Teams
  ├── Games
  ├── GameEvents
  ├── Players
  └── Tournaments
  ```

### Endpoints Principales

- **Gestión de Partidos**
  - `GET /api/games` - Listar partidos
  - `POST /api/games` - Crear nuevo partido
  - `PUT /api/games/{id}/events` - Registrar eventos
  - `GET /api/games/{id}/stream` - Stream SignalR

- **Control de Torneo**
  - `GET /api/tournaments` - Listar torneos
  - `POST /api/tournaments/{id}/teams` - Agregar equipos
  - `GET /api/tournaments/{id}/standings` - Ver posiciones

### Características de Seguridad

- Autenticación JWT con OAuth 2.0
- Rate limiting por IP y token
- Validación de modelos automática
- CORS configurado para UI
- Logging estructurado

### Patrones Implementados

- **Repository Pattern**
  - Abstracción de acceso a datos
  - Interfaces genéricas
  - Implementaciones específicas

- **CQRS Simplificado**
  - Commands para mutaciones
  - Queries para lecturas
  - DTOs específicos

- **Event Sourcing**
  - Registro inmutable de eventos
  - Reconstrucción de estado
  - Auditoría completa



## Frontend

El frontend está desarrollado en Angular 17, aprovechando las últimas características del framework y siguiendo las mejores prácticas de desarrollo web moderno.

### Estructura del Proyecto

```
src/app/
├── components/        # Componentes reutilizables
├── pages/             # Páginas principales
├── services/          # Servicios y lógica de negocio
├── models/            # Interfaces y tipos
├── guards/            # Guards de autenticación
├── pipes/             # Pipes personalizados
└── utils/             # Utilidades y helpers
```

### Componentes Principales

- **Vista Pública (`display-view`)**
  - Marcador en tiempo real
  - Optimizado para proyección
  - Adaptable a múltiples resoluciones
  - Animaciones de puntuación
  - Modo oscuro/claro

- **Panel de Control (`control-panel`)**
  - Dashboard para operadores
  - Control completo del partido
  - Historial de acciones en tiempo real
  - Atajos de teclado configurables
  - Validación de acciones

### Características Técnicas

- **Estado y Gestión de Datos**
  - NgRx para gestión de estado
  - Signals para estado reactivo
  - Caching optimizado
  - Persistencia selectiva

- **Comunicación en Tiempo Real**
  - Integración con SignalR
  - Reconexión automática
  - Buffer de eventos offline
  - Sincronización de reloj

- **Optimización de Rendimiento**
  - Lazy loading de módulos
  - Preloading estratégico
  - Compresión de assets
  - PWA con service worker

### Seguridad Implementada

- **Autenticación**
  - [OAuth 2.0 (Google/GitHub)](docs/oauth2-implementation.md)
  - JWT con refresh tokens
  - Protección CSRF
  - Sesiones persistentes

- **Autorización**
  - Roles (Admin/Operator/Viewer)
  - Guards por ruta
  - Directivas de permisos
  - Validación de acciones

### UI/UX

- **Diseño Responsivo**
  - Mobile-first approach
  - Grid system flexible
  - Breakpoints personalizados
  - Media queries optimizadas

- **Accesibilidad**
  - ARIA labels
  - Navegación por teclado
  - Alto contraste
  - Screen reader compatible

### Integración

- **Proxy Configuration**
  - Nginx como reverse proxy
  - Compresión gzip
  - Cache headers optimizados
  - SSL/TLS configurado

---

## Despliegue con Docker Compose

Servicios:

- SQL Server  
- Init DB  
- API .NET  
- UI Angular + Nginx  

### Variables `.env`
  
SA_PASSWORD=Proyect0Web2025!
ASPNETCORE_URLS=http://0.0.0.0:8080
  
DB_NAME=MarcadorDB
  
> Nota: En Docker usa `ASPNETCORE_URLS=http://0.0.0.0:8080` para que el contenedor escuche en todas las interfaces. Para ejecución local directa (sin Docker), puedes usar `ASPNETCORE_URLS=http://localhost:8080`.

### Comandos Docker principales

| Comando | Descripción |
|--------|-------------|
| `docker-compose --profile all up --build` | Levanta todo y construye imágenes |
| `docker-compose up` | Inicia sin reconstruir imágenes |
| `docker-compose up -d` | Modo segundo plano |
| `docker-compose down` | Elimina contenedores y redes |
| `docker-compose build` | Construye imágenes sin ejecutar |
| `docker-compose ps` | Lista contenedores |
| `docker-compose logs -f` | Logs en tiempo real |
| `docker-compose restart` | Reinicia todo |

---

## Requisitos mínimos de ejecución

### Windows 10/11
- Docker Desktop + WSL2  
- 8 GB RAM  

### Linux / macOS
- Docker Engine/Desktop  
- 2–4 GB RAM recomendado  

---

## Observabilidad, Registros y Auditoría

- Historial de eventos  
- Logs estructurados en API  
- Logs Nginx rotados  
- Endpoint `/health`  

---

## Errores Comunes y Solución de Problemas

| Problema | Solución |
|---------|----------|
SQL no inicia | Revisar contraseña de SA |
Nginx no conecta | API caída o proxy mal configurado |
Angular falla | Borrar `node_modules` y `package-lock.json` |

---

## Limitaciones y Consideraciones de Diseño

- Reloj corre en cliente  
- Sincronización recomendada  
- Seguridad básica  
- Falta test E2E  

---

## Extensiones y Mejoras Futuras

- SignalR / WebSockets globales  
- Reportes avanzados  
- Exportar PDF/Excel  
- Mejor accesibilidad  

---

## Mantenimiento y Operación

- Backup de volúmenes SQL  
- Versionado de scripts BD  
- EF migrations  
- Versionado semántico  

---

## Herramientas Utilizadas

### Desarrollo Backend
- **.NET 8**
  - ASP.NET Core 8.0 para APIs
  - SignalR para tiempo real
  - Entity Framework Core 8.0
  - Microsoft.AspNetCore.Authentication.JwtBearer

### Base de Datos y Almacenamiento
- **SQL Server 2022**
  - SQL Server Management Studio 19
  - Azure Data Studio
- **MongoDB 7.0**
  - Mongoose ODM
  - MongoDB Compass
- **PostgreSQL 16**
  - PgAdmin 4
  - TypeORM

### Desarrollo Frontend
- **Angular 17**
  - Angular CLI 17.0
  - NgRx 17 para estado
  - Angular Material UI
  - RxJS 7.8
- **Node.js 20 LTS**
  - npm 10.2
  - Express.js 4.18
  - Passport.js

### DevOps y Despliegue
- **Docker & Containerización**
  - Docker Engine 24.0
  - Docker Compose v2
  - Docker Desktop
- **Nginx 1.25**
  - Reverse proxy
  - SSL/TLS
  - Compresión gzip

### Herramientas de Desarrollo
- **IDEs y Editores**
  - Visual Studio 2022
  - Visual Studio Code
  - DataGrip 2023.2
- **Control de Versiones**
  - Git 2.42
  - GitHub
  - GitHub Actions

### Testing y Calidad
- **Frameworks de Testing**
  - xUnit para .NET
  - Jest para JavaScript
  - Jasmine para Angular
- **Herramientas de Calidad**
  - ESLint
  - Prettier
  - SonarQube

---

## Autores

| Nombre | Carné |
|--------|-------|
| ANGEL ENRIQUE IBAÑEZ LINARES | 7690-22-19119 |
| BRYAN MANUEL PINEDA OROZCO | 7690-16-8869 |
| CESAR ALBERTO TECUN LEIVA | 7690-22-11766 |
| EDRAS FERNANDO TATUACA ALVARADO | 7690-22-11542 |
| JOSE DANIEL TOBAR REYES | 7690-21-1325 |
| PABLO ANTONIO ISPACHE ARRIAGA | 7690-17-940 |
