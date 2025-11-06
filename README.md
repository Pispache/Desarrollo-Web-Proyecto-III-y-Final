<a id="top"></a>

# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Proyecto Final - Desarrollo Web  
Aplicación web para gestionar un marcador de baloncesto en tiempo real con control de reloj, cuartos, puntuación, faltas, deshacer eventos y vista pública.

**Producción:** https://tobarumg.lat/login  
**SSH:** `ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237`  
**IP Pública:** `167.172.214.237`

---

<a id="indice"></a>

## Índice

| Sección | Enlace |
|--------|--------|
| 1. Descripción General | [Click aquí para ir a la sección](#descripcion-general) |
| 2. Arquitectura General | [Click aquí para ir a la sección](#arquitectura-general) |
| 3. Backend (.NET 8) | [Click aquí para ir a la sección](#backend) |
| 4. Base de Datos | [Click aquí para ir a la sección](#base-de-datos) |
| 5. Frontend (Angular) | [Click aquí para ir a la sección](#frontend) |
| 6. Docker & Deployment | [Click aquí para ir a la sección](#docker) |
| 7. Requisitos del Sistema | [Click aquí para ir a la sección](#requisitos) |
| 8. Observabilidad / Auditoría | [Click aquí para ir a la sección](#observabilidad) |
| 9. Errores Comunes | [Click aquí para ir a la sección](#errores) |
| 10. Limitaciones | [Click aquí para ir a la sección](#limitaciones) |
| 11. Mejoras Futuras | [Click aquí para ir a la sección](#mejoras) |
| 12. Mantenimiento | [Click aquí para ir a la sección](#mantenimiento) |
| 13. Herramientas Utilizadas | [Click aquí para ir a la sección](#herramientas) |
| 14. Autores | [Click aquí para ir a la sección](#autores) |

---

<a id="descripcion-general"></a>

## Descripción General

Aplicación para uso en tiempo real en partidos de baloncesto:

- Control de reloj por cuarto
- Registro de puntos y faltas
- Avance automático o manual de cuarto
- Opción para deshacer eventos
- Panel del operador y vista pública
- Historial auditable del partido

[⬆️ Volver al inicio](#indice)

---

<a id="arquitectura-general"></a>

## Arquitectura General

Sistema dividido en tres piezas principales:

- Angular + Nginx — UI y tablero  
- .NET 8 Minimal API — lógica del juego  
- SQL Server 2022 — persistencia  

Flujo:  
UI → API → BD → UI

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

[⬆️ Volver al inicio](#indice)

---

<a id="backend"></a>

## Construcción del Backend

- ASP.NET Core 8 — Minimal APIs  
- Entity Framework Core  
- DbContext para Teams, Games y GameEvents  

Reglas clave:

- No marcador negativo  
- No tiempo negativo  
- Cambio automático de cuarto  
- Undo mediante eventos históricos  

[⬆️ Volver al inicio](#indice)

---

<a id="base-de-datos"></a>

## Base de Datos (SQL Server 2022 y MongoDB)

Tablas principales:

- Games  
- GameEvents  
- Teams (opcional)  

Características:

- Llaves PK/FK  
- Índices por partido y tiempo  
- Historial permanente de eventos  

[⬆️ Volver al inicio](#indice)

---

<a id="frontend"></a>

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

[⬆️ Volver al inicio](#indice)

---

<a id="docker"></a>

## Despliegue con Docker Compose

Servicios:

- SQL Server  
- Init DB  
- API .NET  
- UI Angular + Nginx  

### Variables `.env`

```env
SA_PASSWORD=Proyect0Web2025!
ASPNETCORE_URLS=http://0.0.0.0:8080
DB_NAME=MarcadorDB
