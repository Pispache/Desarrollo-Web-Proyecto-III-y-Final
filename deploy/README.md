# Despliegue en VPS con HTTPS (Nginx + Certbot)

Este proyecto está preparado para ejecutarse en Docker y exponerse por un Nginx del host con TLS de Let's Encrypt (Certbot).

## Estructura relevante
- `docker-compose.yml`: define servicios (API .NET, UI Angular+Nginx, Auth Service NodeJS, DBs, etc.).
- `deploy/nginx/marcador.conf`: reverse proxy para el host.
- `deploy/.env.prod.example`: variables de entorno para producción.

## 1) Preparar variables de entorno
Copia el archivo de ejemplo como `.env` en la raíz del repo y ajusta valores:

```bash
cp deploy/.env.prod.example .env
# Edita dominio, secretos y callbacks OAuth
```

Claves a revisar en `.env`:
- `DOMAIN` (ej: `tobarumg.lat`)
- `FRONTEND_URL=https://${DOMAIN}`
- `CORS_ORIGIN=http://localhost:4200,https://${DOMAIN}`
- Callbacks OAuth (GitHub/Google/Facebook) deben apuntar a `https://${DOMAIN}`
- Secretos (`JWT_SECRET`, `SESSION_SECRET`, `SA_PASSWORD`, etc.) fuertes.

## 2) Construir e iniciar contenedores
En el VPS (con Docker y Docker Compose instalados):

```bash
docker compose build auth-service ui api report-service pdf-renderer etl
docker compose up -d --profile all
```

Verifica que expongan puertos solo en loopback (seguro por reverse proxy):
- UI: `127.0.0.1:4200`
- API .NET: `127.0.0.1:8080`
- Auth: `127.0.0.1:5001`
- Reports: `127.0.0.1:8081`

## 3) Configurar Nginx (host)
Copia `deploy/nginx/marcador.conf` a `/etc/nginx/sites-available/marcador.conf` y ajusta dominio/certificados si difiere.

```bash
sudo cp deploy/nginx/marcador.conf /etc/nginx/sites-available/marcador.conf
sudo ln -s /etc/nginx/sites-available/marcador.conf /etc/nginx/sites-enabled/marcador.conf
sudo nginx -t
sudo systemctl reload nginx
```

### Certificados (si aún no existen)
Si no tienes certificados, puedes emitirlos con Certbot:

```bash
sudo certbot --nginx -d tobarumg.lat -d www.tobarumg.lat
```

Certbot instalará los archivos y recargará Nginx. La renovación automática se maneja vía `certbot.timer`.

## 4) Verificación rápida
- Interno (VPS):
  - `curl -I http://127.0.0.1:4200` → 200
  - `curl -s http://127.0.0.1:8080/api/health` → JSON ok
  - `curl -s http://127.0.0.1:5001/api/health` → JSON ok
  - `curl -s http://127.0.0.1:8081/health` → ok
- Externo (dominio):
  - `curl -I https://tobarumg.lat` → 200 con certificado válido.
  - Navega a `https://tobarumg.lat` y prueba login, OAuth, reportes.

## 5) Notas técnicas
- La UI usa rutas relativas para Auth Service: `/api/auth`.
- `auth-service` toma `FRONTEND_URL` para redirecciones OAuth. Debe coincidir con el dominio público.
- Ajusta los endpoints de Google/Facebook/GitHub registrando los callback URLs exactamente como en `.env`.

## 6) Actualizaciones
Para aplicar cambios:
```bash
docker compose build auth-service ui api report-service
docker compose up -d auth-service ui api report-service
sudo systemctl reload nginx
```

## 7) Troubleshooting
- Si UI carga pero API falla: revisa `location /api/` en Nginx y puertos del compose.
- CORS: confirma `CORS_ORIGIN` contenga tu dominio con `https://`.
- OAuth: revisa que `GITHUB_CALLBACK_URL` (y otros) usen `https` y coincidan en la consola del proveedor.
