# Marcador de Baloncesto — Angular + .NET 8 + SQL Server (Docker)

Aplicación web para gestionar un marcador de baloncesto con control de tiempo, cuartos y faltas.  
La arquitectura utiliza contenedores para la interfaz de usuario (Angular + Nginx), la API (.NET 8) y la base de datos (SQL Server 2022).

---

## Requisitos previos

1. Docker y Docker Compose v2  
   - Windows: Docker Desktop con WSL2 habilitado.  
   - Linux: Docker Engine y complemento de docker compose.  
2. Git instalado.

---

## Instalación y ejecución

### 1. Clonar el repositorio
```bash
git clone https://github.com/CesarTecun/Marcador-de-baloncesto.git
cd Marcador-de-baloncesto
2. Configurar variables de entorno

Crear un archivo .env en la raíz con el siguiente contenido:

SA_PASSWORD=proyectoweb2025!
ASPNETCORE_URLS=http://0.0.0.0:8080
DB_NAME=MarcadorDB

La contraseña debe cumplir los requisitos de SQL Server (mayúsculas, minúsculas, dígitos y símbolo).
3. Levantar la aplicación con Docker Compose

Para iniciar todos los servicios:

docker compose --profile all up --build

Acceso a los servicios

    Interfaz de usuario: http://localhost:4200

    API: http://localhost:8080/health

    Base de datos SQL Server: localhost,1433 (usuario sa, contraseña definida en .env)

Descripción de servicios

    db: Servidor SQL Server 2022.

    db_init: Ejecuta los scripts db/init.sql y db/seed.sql para crear y poblar la base de datos.

    api: API desarrollada en .NET 8, expuesta en el puerto 8080.

    ui: Aplicación Angular compilada y servida con Nginx en el puerto 4200.

Estructura del proyecto
.
├─ api/                 # API en .NET 8
├─ ui/                  # Frontend Angular + Nginx
├─ db/                  # Scripts de base de datos
│  ├─ init.sql
│  └─ seed.sql
├─ scripts/             # Scripts auxiliares
├─ docker-compose.yml
├─ .env                 # Variables de entorno
└─ docs/
   └─ README.md

Pruebas de la API
Con el sistema en ejecución:
# Verificar estado
curl http://localhost:8080/health

# Listar juegos
curl http://localhost:8080/api/games

# Crear un juego
curl -X POST http://localhost:8080/api/games \
  -H "Content-Type: application/json" \
  -d '{"home":"Leones","away":"Panteras"}'

Desarrollo local (opcional)

    Ejecutar solo la interfaz: comentar el bloque /api/ en ui/nginx.conf y reconstruir el contenedor.

    Ejecutar la API fuera de Docker: ejecutar dotnet run en el directorio api/ y ajustar la configuración de Nginx para apuntar a host.docker.internal:8080 (o a la IP del host en Linux).

Detener y limpiar

# Detener contenedores
docker compose down

# Detener y eliminar volúmenes (borra datos de la base)
docker compose down -v

Solución de problemas

    Error "host not found in upstream 'api'": levantar la API junto con la UI o desactivar el proxy /api/ en ui/nginx.conf.

    Error de contraseña en SQL Server: modificar SA_PASSWORD en .env asegurando que cumpla con la política de seguridad.

    Fallo en instalación de dependencias de Angular: regenerar package-lock.json y reconstruir la imagen.
