/**
 * summary:
 *   Interceptor HTTP para adjuntar el token JWT y manejar 401 globalmente.
 * remarks:
 *   - Inyecta `Authorization: Bearer <token>` en cada petición si existe.
 *   - Ante 401 fuerza logout y redirige a `/login?reason=expired`.
 *   - Evita duplicar notificaciones y respeta el estado actual de sesión.
 */
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError(err => {
      if (err?.status === 401) {
        // NO cerrar sesión si el error viene de la API de reportes
        const isReportsApi = req.url.includes('localhost:8081') || req.url.includes('/v1/reports');
        
        // NO cerrar sesión si el error viene del Auth Service (OAuth)
        const isAuthService = req.url.includes('localhost:5001') || req.url.includes('/api/auth');
        
        // NO cerrar sesión si el usuario tiene un token de OAuth
        const user = auth.getCurrentUser();
        const isOAuthUser = user?.oauth_provider !== null && user?.oauth_provider !== undefined;
        
        // Solo forzar logout si:
        // - NO es la API de reportes
        // - NO es el Auth Service
        // - NO es un usuario de OAuth (porque el Game Service no acepta esos tokens)
        // - El usuario está autenticado
        if (!isReportsApi && !isAuthService && !isOAuthUser && auth.isAuthenticated()) {
          auth.logout(true, 'expired', 'interceptor');
        }
      }
      return throwError(() => err);
    })
  );
};
