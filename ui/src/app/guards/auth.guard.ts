import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  // Redirigir de forma sincrónica con UrlTree para evitar parpadeo de la vista
  return router.createUrlTree(['/login'], { queryParams: { reason: 'expired' } });
};
