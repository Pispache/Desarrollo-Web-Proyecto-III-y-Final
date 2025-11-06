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
| 4. Base de Datos | [Click aquí para ir a la sección](#base-de-datos-sql-server-2022-y-mongodb) |
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
- Avance automático o manual de cuarto
- Opción para deshacer eventos
- Panel del operador y vista pública
- Historial auditable del partido

---

## Arquitectura General

Sistema dividido en tres piezas principales:

- Angular + Nginx — UI y tablero  
- .NET 8 Minimal API — lógica del juego  
- SQL Server 2022 — persistencia  

Flujo:  
UI → API → BD → UI

---

### Arquitectura Extendida

| Microservicio / Componente | Lenguaje / Framework | Base de Datos | Tipo BD | Función |
|----------------------------|----------------------|--------------|---------|--------|
| Auth-Service | .NET 8 | SQL Server | Relacional | JWT, login, roles |
| Matches-Service | .NET 8 + SignalR | SQL Server | Relacional | Marcador y cronómetro |
| Tournament-Service | .NET 8 | SQL Server | Relacional | Torneos y jornadas |
| Teams-Service | Spring Boot | PostgreSQL | Relacional | Equipos |
| Players-Service | Node.js | MySQL | Relacional | Jugadores |
| Report-Service | FastAPI | MongoDB | NoSQL | Reportes agregados |
| ETL-Service | Python | MongoDB | NoSQL | Integración de datos |

---

## Construcción del Backend

- ASP.NET Core 8 — Minimal APIs  
- Entity Framework Core  
- DbContext para Teams, Games y GameEvents  

Reglas clave:

- No marcador negativo  
- No tiempo negativo  
- Cambio automático de cuarto  
- Undo mediante eventos históricos  

---

## Base de Datos (SQL Server 2022 y MongoDB)

Tablas principales:

- Games  
- GameEvents  
- Teams (opcional)  

Características:

- Llaves PK/FK  
- Índices por partido y tiempo  
- Historial permanente de eventos  

---

## Frontend

- Angular 20  
- Componentes: Display & Control Panel  
- HTTP Client + servicios centralizados  
- Backend accesible vía `/api` proxy Nginx  

Funciones:

- Puntos y faltas
- Control de reloj
- Undo
- Cambio de cuarto

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
| `docker-compose up` | Inicia sin reconstruir |
| `docker-compose up -d` | Modo segundo plano |
| `docker-compose down` | Apaga y limpia |
| `docker-compose build` | Construye imágenes |
| `docker-compose ps` | Ver contenedores |
| `docker-compose logs -f` | Logs en vivo |
| `docker-compose restart` | Reinicio completo |

---

## Requisitos mínimos de ejecución

### Windows

- Docker Desktop + WSL2  
- 8 GB RAM mínimo (16 GB recomendado)

### Linux / macOS

- Docker Engine/Desktop  
- 2–4 GB RAM mínimo  

---

## Observabilidad, Registros y Auditoría

- Logs estructurados  
- Nginx con rotación  
- `/health` endpoint  
- Historial auditable por eventos  

---

## Errores Comunes y Solución

| Problema | Solución |
|--------|---------|
SQL Server falla | Revisar contraseña SAFE |
Nginx no conecta | API no levantada |
Angular no compila | Borrar `package-lock.json` y reinstall |

---

## Limitaciones y Consideraciones

- Reloj corre en cliente  
- Sincronizar estado periódicamente  
- Seguridad base, mejorable  
- Falta test e2e  

---

## Extensiones Futuras

- WebSockets / SignalR  
- Estadísticas avanzadas  
- Exportación PDF/Excel  
- Shortcuts y UX accesible  

---

## Mantenimiento

- Respaldar volúmenes  
- Versionado de scripts SQL  
- EF Migrations  
- Versiones semánticas Docker  

---

## Herramientas Utilizadas

- .NET 8  
- SQL Server 2022  
- Angular 20  
- Docker Compose  
- Nginx  

---

## Autores

| Nombre | Carné |
|---------|------------|
| ANGEL ENRIQUE IBAÑEZ LINARES | 7690-22-19119 |
| BRYAN MANUEL PINEDA OROZCO | 7690-16-8869 |
| CESAR ALBERTO TECUN LEIVA | 7690-22-11766 |
| EDRAS FERNANDO TATUACA ALVARADO | 7690-22-11542 |
| JOSE DANIEL TOBAR REYES | 7690-21-1325 |
| PABLO ANTONIO ISPACHE ARRIAGA | 7690-17-940 |
