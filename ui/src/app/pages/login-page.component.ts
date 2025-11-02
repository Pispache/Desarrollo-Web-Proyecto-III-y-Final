/**
 * Esta página permite autenticar a un usuario para acceder a funciones protegidas.
 * - Recoge credenciales (usuario y contraseña) y las envía al servicio de autenticación.
 * - Gestiona el estado de carga y mensajes de error.
 * - Detecta razones de redirección (sesión expirada, cierre de sesión) y muestra avisos.
 *
 * Funcionalidad clave:
 * - Usa `AuthService` para validar credenciales y almacenar el token JWT.
 * - Redirige al tablero principal al iniciar sesión correctamente.
 * - Maneja parámetros de query (`reason`) para informar al usuario.
 *
 * UX / Accesibilidad:
 * - Mensajes claros en caso de error o sesión caducada.
 * - Botón de envío con indicador de carga para feedback visual.
 * - Soporte para autofocus en el campo usuario (definido en el template).
 *
 * Mantenimiento:
 * - Centralizar la lógica de autenticación en `AuthService`.
 * - Mantener mensajes de error simples y comprensibles para el usuario final.
 */


import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
  imports: [CommonModule, FormsModule, RouterModule]
})
export class LoginPageComponent {
  email = '';
  password = '';
  loading = false;
  error = '';
  info = '';
  regName = '';
  regEmail = '';
  regPassword = '';
  regLoading = false;
  regError = '';
  regSuccess = '';

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {
    // Manejar callback de OAuth primero (tiene prioridad)
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      try {
        this.auth.handleOAuthCallback(token);
      } finally {
        try { window.dispatchEvent(new Event('uiBootOn')); } catch {}
        try { sessionStorage.setItem('ui.boot', '1'); } catch {}
        // Navegar inmediatamente y reemplazar la URL para eliminar el token del historial
        this.router.navigateByUrl('/', { replaceUrl: true });
      }
      return;
    }

    // Mostrar mensajes según motivo de redirección solo si no hay token
    try {
      const qp = this.route.snapshot.queryParamMap;
      const reason = (qp.get('reason') || '').toLowerCase();
      if (reason === 'expired') {
        this.error = 'Tu sesión expiró. Ingresa nuevamente.';
      } else if (reason === 'logged_out') {
        this.error = 'Cerraste sesión correctamente.';
      }
      const verified = qp.get('verified');
      if (verified === '1') {
        this.info = 'Correo verificado. Ya puedes iniciar sesión.';
      }
      const err = qp.get('error');
      if (err === 'verify_expired') {
        this.error = 'El enlace de verificación expiró. Reenvía la verificación.';
      } else if (err === 'verify_invalid') {
        this.error = 'El enlace de verificación no es válido.';
      }
    } catch {}
  }

  submitRegister() {
    this.regError = '';
    this.regSuccess = '';
    const name = this.regName.trim();
    const email = this.regEmail.trim();
    const password = this.regPassword;
    if (!name || !email || !password) { this.regError = 'Completa nombre, email y contraseña'; return; }
    this.regLoading = true;
    try { window.dispatchEvent(new Event('uiBootOn')); } catch {}
    this.auth.register({ name, email, password }).subscribe({
      next: (res) => {
        this.regLoading = false;
        if (res.success) {
          const hasToken = !!(res as any)?.token?.access_token;
          if (hasToken) {
            try { sessionStorage.setItem('ui.boot', '1'); } catch {}
            this.router.navigateByUrl('/', { replaceUrl: true });
          } else {
            this.regSuccess = 'Registro exitoso. Revisa tu correo para verificar tu cuenta.';
            try { window.dispatchEvent(new Event('uiBootOff')); } catch {}
          }
        } else {
          const firstErr = (res as any)?.errors?.[0]?.msg;
          this.regError = firstErr || res.message || 'No se pudo registrar';
          try { window.dispatchEvent(new Event('uiBootOff')); } catch {}
        }
      },
      error: (err) => {
        this.regLoading = false;
        const firstErr = err?.error?.errors?.[0]?.msg;
        this.regError = firstErr || err?.error?.message || err?.error?.error || 'No se pudo registrar';
        try { window.dispatchEvent(new Event('uiBootOff')); } catch {}
      }
    });
  }

  submit() {
    this.error = '';
    const e = this.email.trim();
    const p = this.password;
    if (!e || !p) { this.error = 'Ingrese email y contraseña'; return; }
    this.loading = true;
    try { window.dispatchEvent(new Event('uiBootOn')); } catch {}
    this.auth.login(e, p).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          try { sessionStorage.setItem('ui.boot', '1'); } catch {}
          this.router.navigateByUrl('/', { replaceUrl: true });
        } else {
          this.error = res.message || 'Error al iniciar sesión';
          try { window.dispatchEvent(new Event('uiBootOff')); } catch {}
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = (err?.error?.message || err?.error?.error || 'Credenciales inválidas');
        try { window.dispatchEvent(new Event('uiBootOff')); } catch {}
      }
    });
  }

  loginWithGoogle() {
    this.auth.loginWithGoogle();
  }

  loginWithFacebook() {
    this.auth.loginWithFacebook();
  }

  loginWithGitHub() {
    this.auth.loginWithGitHub();
  }
}
