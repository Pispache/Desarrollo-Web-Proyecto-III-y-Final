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
        // (puede ser un problema de configuración temporal)
        const isReportsApi = req.url.includes('localhost:8081') || req.url.includes('/v1/reports');
        
        if (!isReportsApi && auth.isAuthenticated()) {
          // Solo forzar logout para errores 401 de la API principal
          auth.logout(true, 'expired', 'interceptor');
        }
      }
      return throwError(() => err);
    })
  );
};
