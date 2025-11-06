# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Proyecto Final — Desarrollo Web  
Aplicación web para gestionar un marcador de baloncesto en tiempo real con control de reloj, cuartos, puntuación, faltas, deshacer eventos y vista pública.

**Producción:** https://tobarumg.lat/login  
**SSH:** `ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237`  
**IP Pública:** `167.172.214.237`

---

## Índice

| Sección | Enlace |
|--------|--------|
| 1. Descripción General | [Ir](#descripción-general) |
| 2. Arquitectura General | [Ir](#arquitectura-general) |
| 3. Backend (.NET 8) | [Ir](#construcción-del-backend) |
| 4. Base de Datos | [Ir](#base-de-datos--sql-server-2022) |
| 5. Frontend (Angular) | [Ir](#frontend) |
| 6. Docker & Deployment | [Ir](#despliegue-con-docker-compose) |
| 7. Requisitos del Sistema | [Ir](#requisitos-mínimos-de-ejecución) |
| 8. Observabilidad / Auditoría | [Ir](#observabilidad-registros-y-auditoría) |
| 9. Errores Comunes | [Ir](#errores-comunes-y-solución-de-problemas) |
| 10. Limitaciones | [Ir](#limitaciones-y-consideraciones-de-diseño) |
| 11. Mejoras Futuras | [Ir](#extensiones-y-mejoras-futuras) |
| 12. Mantenimiento | [Ir](#mantenimiento-y-operación) |
| 13. Herramientas Utilizadas | [Ir](#herramientas-utilizadas) |
| 14. Autores | [Ir](#autores) |

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

Separación favorece despliegue y escalabilidad independiente.

---

## Construcción del Backend

- ASP.NET Core 8 — Minimal APIs  
- Entity Framework Core  
- DbContext mapeando Teams, Games y GameEvents  

Reglas clave:

- No marcador negativo  
- No tiempo negativo  
- Cambio automático de cuarto  
- Deshacer basado en eventos  

---

## Base de Datos — SQL Server 2022

Tablas principales:

- Games  
- GameEvents  
- Teams (opcional)  

Características:

- PK/FK  
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

Servido con Nginx (proxy a `/api`).

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
| `docker-compose --profile all up --build` | Levanta todo el proyecto y construye imágenes |
| `docker-compose up` | Inicia sin reconstruir imágenes |
| `docker-compose up -d` | Ejecuta en segundo plano |
| `docker-compose down` | Detiene y elimina contenedores/redes |
| `docker-compose build` | Construye imágenes sin ejecutar |
| `docker-compose ps` | Lista contenedores |
| `docker-compose logs -f` | Logs en tiempo real |
| `docker-compose restart` | Reinicia contenedores |

---

## Requisitos mínimos de ejecución

### Windows 10/11
- Docker Desktop + WSL2  
- 8 GB RAM (mínimo)  

### Linux / macOS
- Docker Engine/Desktop  
- 8–16 GB RAM recomendado  

---

## Observabilidad, Registros y Auditoría

- Historial de eventos = fuente de verdad  
- Logs estructurados en API  
- Nginx con rotación de logs  
- Endpoint `/health`  

---

## Errores Comunes y Solución de Problemas

| Problema | Solución |
|---------|----------|
SQL no inicia | Contraseña no cumple reglas |
Nginx no conecta | API no levantada o proxy mal configurado |
Angular falla en build | Borrar `package-lock.json` y rebuild |

---

## Limitaciones y Consideraciones de Diseño

- Reloj corre en cliente (latencia cero)  
- Sincronización recomendada  
- Seguridad básica (mejorable)  
- Falta test E2E (sugerido agregar)  

---

## Extensiones y Mejoras Futuras

- WebSockets / SignalR  
- Estadísticas y reportes  
- Exportar PDF/Excel  
- Accesibilidad y shortcuts  

---

## Mantenimiento y Operación

- Respaldar volúmenes SQL  
- Versionar scripts BD  
- EF migrations  
- Versionado semántico Docker  

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
|--------|------|
Cesar Alberto Tecún Leiva | 7690-22-11766  
Jose Daniel Tobar Reyes | 7690-21-13125  
Bryan Manuel Pineda Orozco | 7690-16-8869  

Grupo #8 — Desarrollo Web UMG

- ANGEL ENRIQUE IBAÑEZ LINARES 7690-22-19119
- BRYAN MANUEL PINEDA OROZCO 7690-16-8869
- CESAR ALBERTO TECUN LEIVA 7690-22-11766
- EDRAS FERNANDO TATUACA ALVARADO 7690-22-11542
- JOSE DANIEL TOBAR REYES 7690-21-1325
- PABLO ANTONIO ISPACHE ARRIAGA 7690-17-940

---

