# Notas de despliegue (sensibles)

Estas notas contienen información específica de despliegue. Evita publicarlas en el README principal.

- LINK DE LA APLICACIÓN: https://tobarumg.lat/login
- Acceso SSH (ejemplo):
  - ssh -i "C:\Users\josed\.ssh\id_ed25519" root@167.172.214.237
- IP pública del servidor: 167.172.214.237

Recomendaciones:
- Gestionar estas credenciales mediante variables de entorno/secrets.
- Rotar claves y contraseñas periódicamente.
- No commitear archivos privados ni claves en el repositorio.
