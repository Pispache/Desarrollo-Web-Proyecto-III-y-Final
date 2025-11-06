import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// Guard que siempre se ejecuta al entrar a páginas públicas (login/registro)
// y asegura que no quede ninguna sesión activa ni estado de UI residual.
export const authClearGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    // Limpia token/usuario pero NO navega (para no interferir con la ruta pública)
    auth.logout(false, 'manual', 'guard');
  } catch {}
  // Además, si por alguna razón Angular quedó con estado previo, forzar ocultar navbar
  // se consigue porque AppComponent escucha authed$ y lo pondrá en false.
  return true;
};
