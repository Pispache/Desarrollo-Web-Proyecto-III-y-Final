## 🏀 Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Proyecto Final — Desarrollo Web  
Aplicación web para gestionar un marcador de baloncesto en tiempo real con control de reloj, cuartos, puntuación, faltas, deshacer eventos y vista pública.

🔗 **URL Producción:** https://tobarumg.lat/login  
📡 **SSH:** `ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237`  
🌍 **IP Pública:** `167.172.214.237`

---

## 📚 Índice

| Sección | Enlace |
|--------|--------|
| 1. Descripción General | [Ir a Descripción General](#-descripción-general) |
| 2. Arquitectura General | [Ir a Arquitectura General](#-arquitectura-general) |
| 3. Backend (.NET 8) | [Ir a Backend](#-construcción-del-backend) |
| 4. Base de Datos | [Ir a Base de Datos](#-base-de-datos--sql-server-2022) |
| 5. Frontend (Angular) | [Ir a Frontend](#-frontend) |
| 6. Docker & Deployment | [Ir a Docker](#-despliegue-con-docker-compose) |
| 7. Requisitos del Sistema | [Ir a Requisitos](#-requisitos-mínimos-de-ejecución) |
| 8. Observabilidad / Auditoría | [Ir a Observabilidad](#-observabilidad-registros-y-auditoría) |
| 9. Errores Comunes | [Ir a Errores](#-errores-comunes-y-solución-de-problemas) |
| 10. Limitaciones | [Ir a Limitaciones](#-limitaciones-y-consideraciones-de-diseño) |
| 11. Mejoras Futuras | [Ir a Mejoras Futuras](#-extensiones-y-mejoras-futuras) |
| 12. Mantenimiento | [Ir a Mantenimiento](#-mantenimiento-y-operación) |
| 13. Herramientas Utilizadas | [Ir a Herramientas](#-herramientas-utilizadas) |
| 14. Autores | [Ir a Autores](#-autores) |

---

## 🧾 Descripción General

Aplicación para uso en tiempo real en partidos de baloncesto:

- Control de reloj por cuarto
- Registro de puntos y faltas
- Avance automático de cuarto
- Opción para deshacer eventos
- Panel de operador y vista pública
- Eventos auditables y consistentes

---

## 🏗 Arquitectura General

Sistema dividido en tres piezas principales:

- **Angular + Nginx** — UI y tablero
- **.NET 8 Minimal API** — lógica del juego
- **SQL Server 2022** — persistencia

La UI envía acciones a la API → la API aplica reglas → guarda en BD → UI muestra estado.

La arquitectura permite:

- Separación de responsabilidades
- Despliegue y escalamiento independiente
- Persistencia completa del historial de juego

---

## 🧠 Construcción del Backend

- ASP.NET Core 8 — Minimal APIs
- Entity Framework Core
- DbContext para Teams, Games, GameEvents
- Endpoints pequeños y transacciones cortas
- Historial completo de acciones del juego

Modelo incluye:

- **Game:** estado del partido, cuarto, tiempo
- **GameEvent:** bitácora auditada de eventos
- **Team:** equipos registrados

Reglas clave:

- No marcador negativo
- No tiempo negativo
- Cambio de cuarto automático
- Undo mediante reconstrucción de eventos

---

## 🛢 Base de Datos — SQL Server 2022

Tablas principales:

- **Games**
- **GameEvents**
- **Teams** (opcional)

Características:

- Llaves PK/FK
- Índices por partido y timestamp
- Auditoría de eventos
- Scripts de creación y seed automatizados

---

## 🎨 Frontend

Componentes:

- **Display**: vista pública del marcador
- **Panel de control** para el operador

Funciones:

- Registrar puntos y faltas
- Iniciar / pausar reloj
- Ajustar tiempo
- Cambio de cuarto
- Deshacer acciones

Comunicación vía HTTP → servicio Angular tipado.

Servido por **Nginx** con proxy a `/api`.

---

## 🐳 Despliegue con Docker Compose

Servicios incluidos:

- SQL Server
- Contenedor de inicialización
- API .NET 8
- UI Angular + Nginx

`.env` ejemplo:

