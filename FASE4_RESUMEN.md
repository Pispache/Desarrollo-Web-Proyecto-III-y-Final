# Fase 4 - ETL y Base de Datos ✅

## ¿Qué hicimos?

Implementamos un sistema completo para sincronizar automáticamente los datos del marcador de baloncesto desde SQL Server (donde se guardan en tiempo real) hacia PostgreSQL (donde se hacen los reportes).

---

## Lo que incluye

### 1. Sistema de Sincronización (ETL)

El archivo `etl/main.py` copia los datos automáticamente cada 5 minutos. Si algo falla, lo intenta de nuevo hasta 3 veces. Todo queda registrado en logs para saber qué pasó y cuándo.

**Lo mejor:**
- Si se cae la conexión, reintenta automáticamente
- Guarda un historial de cada sincronización
- Compara que los datos coincidan entre ambas bases
- Si encuentra diferencias, te avisa

### 2. Base de Datos PostgreSQL

Creamos toda la estructura de la base de datos con un sistema de migraciones (como un control de versiones para la BD).

**Tablas principales:**
- `teams` - Equipos
- `players` - Jugadores
- `games` - Partidos
- `game_events` - Eventos del juego (puntos, faltas, etc.)
- `etl_logs` - Historial de sincronizaciones
- `etl_state` - Checkpoints (para saber hasta dónde sincronizó)

**Optimizaciones:**
- Índices en las búsquedas más comunes (hace todo más rápido)
- Relaciones entre tablas bien definidas
- Si borras un equipo, se borran sus jugadores automáticamente

### 3. Scripts Útiles

Creamos varios scripts para facilitar el trabajo:

- **`verify-etl.sh`** - Compara los datos entre ambas bases para verificar que todo esté bien
- **`run-etl-once.sh`** - Ejecuta la sincronización manualmente (útil para pruebas)
- **`rotate-credentials.sh`** - Cambia las contraseñas automáticamente (seguridad)

### 4. Tareas Automáticas

El sistema se ejecuta solo, no tienes que estar pendiente:

- Sincroniza datos cada 5 minutos
- Verifica que todo esté bien todos los días a las 2 AM
- Borra logs viejos cada domingo (para no llenar el disco)
- Hace backup de los checkpoints diariamente

### 5. Seguridad (OWASP)

Implementamos las mejores prácticas de seguridad:

- **Usuarios con permisos mínimos**: Cada usuario solo puede hacer lo que necesita
- **Contraseñas seguras**: Guardadas en variables de entorno, nunca en el código
- **Rotación de contraseñas**: Script para cambiarlas fácilmente cada mes
- **Conexiones cifradas**: SSL/TLS activado
- **Logs seguros**: No se guardan contraseñas en los logs

---

## 🚀 Cómo ponerlo a funcionar

### Paso 1: Configurar las credenciales

```bash
cd etl
cp .env.example .env
nano .env  # Edita y pon tus contraseñas
```

### Paso 2: Crear las tablas en PostgreSQL

```bash
cd db/pg
chmod +x migrate.sh
./migrate.sh
```

### Paso 3: Iniciar el ETL

```bash
docker compose up -d etl
docker logs -f marcador_etl  # Para ver qué está haciendo
```

### Paso 4: Verificar que funcione

```bash
docker exec marcador_etl /app/scripts/verify-etl.sh
```

Deberías ver algo como:
```
✓ Teams: 5 registros (coinciden)
✓ Players: 50 registros (coinciden)
✓ Games: 10 registros (coinciden)
```

---

## ✅ Checklist de lo que pedían

- [x] ETL que se pueda ejecutar varias veces sin duplicar datos
- [x] Logs detallados de cada sincronización
- [x] Validación automática de conteos
- [x] Reintentos si falla la conexión
- [x] Sistema de migraciones para la base de datos
- [x] Índices y relaciones entre tablas
- [x] Tareas programadas (cron) cada 5 minutos
- [x] Usuarios con permisos mínimos (seguridad)
- [x] Rotación de contraseñas
- [x] Contraseñas en archivos .env (no en el código)

---

## 📁 Archivos que creamos

```
etl/
├── main.py (mejorado con reintentos y logs)
├── Dockerfile (con cron y herramientas)
├── crontab (tareas programadas)
├── .env.example (plantilla de configuración)
└── scripts/
    ├── verify-etl.sh (verifica sincronización)
    ├── run-etl-once.sh (ejecuta manualmente)
    └── rotate-credentials.sh (cambia contraseñas)

db/pg/
├── migrate.sh (aplica migraciones)
└── migrations/
    ├── README.md (guía de migraciones)
    ├── 001_initial_schema.sql (tablas base)
    └── 002_add_etl_logs.sql (tabla de logs)
```

---

## 🎯 Seguridad OWASP

Implementamos estos puntos de seguridad:

- **Control de acceso**: Cada usuario solo puede hacer lo necesario
- **Credenciales seguras**: En variables de entorno, nunca en el código
- **Prevención de inyección SQL**: Usamos parámetros en las consultas
- **Configuración segura**: Todo configurado de forma segura por defecto
- **Autenticación**: Rotación de contraseñas cada mes
- **Logs y monitoreo**: Registro completo de todo lo que pasa