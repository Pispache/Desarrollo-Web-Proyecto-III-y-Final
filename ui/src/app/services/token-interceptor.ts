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
        // Solo forzar logout si actualmente hay sesión válida
        if (auth.isAuthenticated()) {
          auth.logout(true, 'expired', 'interceptor');
        }
      }
      return throwError(() => err);
    })
  );
};
