# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Proyecto Final - Desarrollo Web  
Aplicación web para gestionar un marcador de baloncesto en tiempo real con control de reloj, cuartos, puntuación, faltas, deshacer eventos y vista pública.

**Producción:** https://tobarumg.lat/login  
**SSH:** `ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237`  
**IP Pública:** `167.172.214.237`

---

## Índice

| Sección | Enlace |
|--------|--------|
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

Aplicación para uso en tiempo real en partidos de baloncesto:

- Control de reloj por cuarto  
- Registro de puntos y faltas  
- Avance automático de cuarto  
- Opción para deshacer eventos  
- Panel de operador y vista pública  
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

| Microservicio / Componente | Lenguaje / Framework | Base de datos | Tipo BD | Observaciones |
|---------------------------|---------------------|---------------|---------|--------------|
| Auth-Service | C# (.NET 8) | SQL Server 2022 | Relacional | JWT, roles |
| Matches-Service | C# (.NET 8 + SignalR) | SQL Server | Relacional | Marcador y clock realtime |
| Tournament-Service | C# (.NET 8) | SQL Server | Relacional | Torneos y jornadas |
| Teams-Service | Java Spring Boot | PostgreSQL | Relacional | Equipos |
| Players-Service | Node.js Express | MySQL | Relacional | Jugadores |
| Report-Service | Python FastAPI | MongoDB | No SQL | Reportería |
| ETL-Service | Python | MongoDB | No SQL | Consolidación datos |

---

## Construcción del Backend

- ASP.NET Core 8 — Minimal APIs  
- Entity Framework Core  
- DbContext para Teams, Games, GameEvents  

Reglas:

- No marcador negativo  
- No tiempo negativo  
- Cambio manual de cuarto  
- Deshacer basado en eventos  

---

## Base de Datos - SQL Server 2022 - Mongo

Tablas principales:

- Games  
- GameEvents  
- Teams  

Características:

- Claves primarias y foráneas  
- Índices por partido y timestamp  
- Historial completo de eventos  

---

## Frontend

Componentes:

- Display — vista pública  
- Panel de control — consola del operador  

Funciones:

- Registrar puntos y faltas  
- Control de reloj  
- Cambio de cuarto  
- Deshacer eventos  

Servido con Nginx (proxy `/api`).

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

- .NET 8  
- EF Core  
- SQL Server 2022  
- Angular 20 + Nginx  
- Docker Compose  

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
