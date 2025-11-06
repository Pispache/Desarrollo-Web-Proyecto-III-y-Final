/**
 * summary:
 *   Interceptor HTTP para adjuntar el token JWT y manejar 401/403 globalmente.
 * remarks:
 *   - Inyecta `Authorization: Bearer <token>` en cada petición si existe.
 *   - Ante 401 fuerza logout y redirige a `/login?reason=expired` (selectivo).
 *   - Ante 403 redirige a `/control` si autenticado o `/login` si no.
 */
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const tokenInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError(err => {
      if (err?.status === 401) {
        const isReportsApi = req.url.includes('localhost:8081') || req.url.includes('/v1/reports');
        const isAuthService = req.url.includes('localhost:5001') || req.url.includes('/api/auth');
        const user = auth.getCurrentUser();
        const isOAuthUser = user?.oauth_provider !== null && user?.oauth_provider !== undefined;
        if (!isReportsApi && !isAuthService && !isOAuthUser && auth.isAuthenticated()) {
          auth.logout(true, 'expired', 'interceptor');
        }
      }
      else if (err?.status === 403) {
        try {
          if (auth.isAuthenticated()) {
            router.navigateByUrl('/control');
          } else {
            router.navigate(['/login'], { queryParams: { reason: 'expired' } });
          }
        } catch {}
      }
      return throwError(() => err);
    })
  );
};
