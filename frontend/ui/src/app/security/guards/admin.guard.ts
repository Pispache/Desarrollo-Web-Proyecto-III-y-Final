import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated() && auth.isAdmin()) return true;
  // Si está autenticado pero no es admin, redirigir al panel principal
  if (auth.isAuthenticated()) {
    router.navigateByUrl('/control');
  } else {
    router.navigateByUrl('/login');
  }
  return false;
};
