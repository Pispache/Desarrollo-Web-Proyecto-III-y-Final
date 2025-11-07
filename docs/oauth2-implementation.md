# Implementación de OAuth 2.0

## Resumen
El sistema implementa OAuth 2.0 como parte de su estrategia de autenticación, permitiendo a los usuarios iniciar sesión usando sus cuentas de:
- Google
- GitHub
- Facebook

## Arquitectura de Autenticación

### Componentes Principales
1. **Auth Service (Node.js)**
   - Maneja el flujo OAuth 2.0
   - Gestiona tokens y sesiones
   - Integra múltiples proveedores

2. **Frontend (Angular)**
   - Implementa el flujo de UI para OAuth
   - Maneja redirecciones seguras
   - Gestiona tokens JWT

3. **Bases de Datos**
   - MongoDB: Almacena información de usuarios y sesiones
   - Encriptación de datos sensibles

## Flujo de OAuth 2.0

1. **Inicio del Flujo**
   ```
   Usuario -> UI Angular -> Auth Service -> Proveedor OAuth
   ```

2. **Autorización**
   - El usuario elige un proveedor (Google/GitHub/Facebook)
   - Redirección al proveedor para autenticación
   - El proveedor solicita consentimiento del usuario

3. **Callback y Token**
   ```
   Proveedor -> Auth Service -> UI Angular
   ```
   - El proveedor envía el código de autorización
   - Auth Service intercambia el código por tokens
   - Se genera un JWT para el cliente

## Configuración de Proveedores

### Google OAuth
```env
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_CALLBACK_URL=http://localhost:5001/api/auth/google/callback
```

### GitHub OAuth
```env
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
GITHUB_CALLBACK_URL=http://localhost:5001/api/auth/github/callback
```

### Facebook OAuth
```env
FACEBOOK_APP_ID=${FACEBOOK_APP_ID}
FACEBOOK_APP_SECRET=${FACEBOOK_APP_SECRET}
FACEBOOK_CALLBACK_URL=http://localhost:5001/api/auth/facebook/callback
```

## Medidas de Seguridad

1. **Protección de Tokens**
   - Tokens JWT con expiración (1 hora)
   - Almacenamiento seguro en localStorage
   - Refresh tokens manejados server-side

2. **Configuración CORS**
   ```env
   CORS_ORIGIN=http://localhost:4200,https://tobarumg.lat
   ```
   - Orígenes permitidos estrictamente controlados
   - Validación de orígenes en runtime

3. **Sesiones Seguras**
   ```env
   SESSION_SECRET=${SESSION_SECRET}
   ```
   - Secretos únicos por ambiente
   - Rotación periódica de secretos

4. **URLs de Callback**
   - URLs verificadas y validadas
   - No se permiten redirecciones arbitrarias
   - Configuración específica por ambiente

## Gestión de Usuarios

### Creación de Usuarios OAuth
1. Primera autenticación:
   - Se crea perfil automáticamente
   - Se asigna rol `viewer` por defecto
   - Se importa avatar si está disponible

2. Autenticaciones subsecuentes:
   - Se actualiza información del perfil
   - Se mantienen roles y permisos existentes

### Roles y Permisos
- `viewer`: Acceso básico a resultados
- `operator`: Puede gestionar marcadores
- `admin`: Acceso total al sistema

## Endpoints OAuth

### Google
- Login: `/api/auth/google`
- Callback: `/api/auth/google/callback`

### GitHub
- Login: `/api/auth/github`
- Callback: `/api/auth/github/callback`

### Facebook
- Login: `/api/auth/facebook`
- Callback: `/api/auth/facebook/callback`

## Manejo de Errores

1. **Errores de Autenticación**
   - Redirección a página de error
   - Mensaje de error amigable
   - Logging de errores para debugging

2. **Timeouts**
   - Manejo de timeouts en redirecciones
   - Cleanup de sesiones incompletas

3. **Validación de Datos**
   - Verificación de emails
   - Validación de tokens
   - Prevención de ataques CSRF

## Monitoreo y Logging

1. **Eventos Registrados**
   - Intentos de login
   - Errores de autenticación
   - Creación de usuarios
   - Actualización de perfiles

2. **Métricas**
   - Uso por proveedor
   - Tasa de éxito/error
   - Tiempos de respuesta

## Recomendaciones de Seguridad

1. **Configuración**
   - Usar HTTPS en producción
   - Configurar secretos por ambiente
   - Rotar credenciales periódicamente

2. **Desarrollo**
   - No commitear secretos
   - Usar variables de ambiente
   - Validar datos de proveedores

3. **Producción**
   - Monitorear intentos fallidos
   - Revisar logs regularmente
   - Mantener dependencias actualizadas