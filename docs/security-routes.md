# Seguridad y protección de rutas (vista técnica)

Este documento resume cómo se autentican y autorizan las peticiones en cada módulo del proyecto y dónde se aplican las protecciones.

## Variables de entorno relevantes
- `JWT_SECRET` (común): clave de firma HS256.
- `JWT_ISSUER` (por defecto: MarcadorApi).
- `JWT_AUDIENCE` (por defecto: MarcadorUi).

Estas variables son usadas por API (.NET), Report Service (FastAPI) y Auth Service (Node) según el `docker-compose.yml`.

---

## backend-reports (FastAPI)
- Lógica central de seguridad: `backend-reports/reports/app/security/auth.py`
  - `require_admin`: dependencia FastAPI que valida el JWT y exige rol `ADMIN`.
  - Acepta rol desde `roles`/`role` o del claim estándar de .NET:
    `http://schemas.microsoft.com/ws/2008/06/identity/claims/role`.
- Aplicación en rutas: `backend-reports/reports/app/main.py`
  - Ejemplo: `@router.get('/ping')` con `Depends(require_admin)`.
- Cómo proteger un nuevo endpoint:
  - Añade `_, _=Depends(require_admin)` o `dependencies=[Depends(require_admin)]` al handler.

---

## backend-api (.NET 8 Minimal API)
- Configuración central: `backend-api/api/Security/JwtExtensions.cs`
  - `AddJwtAuth(IConfiguration)`: registra `JwtBearer` y políticas:
    - `ADMIN`: requiere rol `ADMIN`.
    - `ADMIN_OR_USER`: permite `ADMIN` o `USUARIO`.
  - `UseJwtIfConfigured(WebApplication)`: activa `UseAuthentication`/`UseAuthorization` si `JWT_SECRET` está definido.
- Activación: `backend-api/api/Program.cs`
  - `b.Services.AddJwtAuth(b.Configuration);`
  - `app.UseJwtIfConfigured();`
- Aplicación en endpoints: `GameEndpoints.cs`, `ClockEndpoints.cs`, `TournamentEndpoints.cs`
  - Ejemplo: `g.MapGet(...).RequireAuthorization("ADMIN_OR_USER")`.
  - Público por diseño: `GET /api/logos/{logoId}` con `AllowAnonymous()`.
- Cómo proteger un nuevo endpoint:
  - Añade `.RequireAuthorization("ADMIN")` o `.RequireAuthorization("ADMIN_OR_USER")`.
  - En controladores, usa `[Authorize(Policy = "ADMIN")]` o `[Authorize(Roles = "ADMIN")]`.

---

## backend-auth-service (Node/Express)
- Lógica central: `backend-auth-service/auth-service/src/security/jwt.js`
  - `verifyToken(req,res,next)`: verifica JWT y adjunta `req.userClaims`.
  - `requireAdmin(req,res,next)`: exige rol `ADMIN` (claim .NET) o `admin` (nativo).
- Aplicación en rutas: `backend-auth-service/auth-service/src/routes/auth.js`
  - Ejemplo: `router.get('/users', verifyToken, requireAdmin, controller)`.
- Emisión de tokens: `src/controllers/authController.js`
  - `generateToken(user)`: incluye claim de rol compatible con .NET y `role` nativo.
- Cómo proteger una ruta nueva:
  - Importa `{ verifyToken, requireAdmin }` desde `../security/jwt` y encadena como middlewares.

---

## frontend/ui (Angular)
- Guards:
  - `src/app/guards/auth.guard.ts`: exige sesión (`isAuthenticated`) y redirige a `/login`.
  - `src/app/guards/admin.guard.ts`: exige admin; si no, redirige a `/control` o `/login`.
- Enrutamiento: `src/app/app.routes.ts`
  - Ejemplo: `path: 'tableros', canActivate: [authGuard]`.
  - Wildcard `**` redirige a `control` (protegido) o se puede cambiar por un componente 404 protegido.
- Interceptor: `src/app/services/token-interceptor.ts`
  - Inserta `Authorization: Bearer <token>`.
  - Manejo de 401: logout selectivo y redirección a login.
  - Manejo de 403: redirección a `/control` si autenticado; a `/login` si no.
- Cómo proteger una vista nueva:
  - Añade `canActivate: [authGuard]` o `[adminGuard]` en `app.routes.ts`.

---

## Flujo típico
1. UI envía peticiones con `Authorization: Bearer <token>` (interceptor).
2. API/Reports validan JWT con `JWT_SECRET` y políticas/guards.
3. Rutas públicas (p.ej., `GET /api/logos/{logoId}`) no requieren token.
4. Si el backend responde 401/403, el interceptor maneja redirecciones según el caso.

---

## Añadir una ruta protegida (checklist)
- FastAPI: `Depends(require_admin)`.
- .NET Minimal API: `.RequireAuthorization("ADMIN")` o `"ADMIN_OR_USER"`.
- Express: encadenar `verifyToken` y opcionalmente `requireAdmin`.
- Angular: `canActivate: [authGuard]` o `[adminGuard]` en `app.routes.ts`.

## Notas de compatibilidad
- Los tokens emitidos por Auth Service incluyen:
  - `role` (nativo, `viewer/operator/admin`).
  - Claim de rol .NET (`.../identity/claims/role`) mapeado a `ADMIN` o `USUARIO`.
- Los servicios consumidores aceptan cualquiera de los dos formatos para roles.
