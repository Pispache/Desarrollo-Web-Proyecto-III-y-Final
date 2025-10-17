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

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {
    // Manejar callback de OAuth primero (tiene prioridad)
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      console.log('OAuth token received, processing...');
      this.auth.handleOAuthCallback(token);
      // Esperar un momento para que se guarde el token
      setTimeout(() => {
        console.log('Redirecting to home...');
        this.router.navigateByUrl('/');
      }, 500);
      return;
    }

    // Mostrar mensajes según motivo de redirección solo si no hay token
    try {
      const reason = (this.route.snapshot.queryParamMap.get('reason') || '').toLowerCase();
      if (reason === 'expired') {
        this.error = 'Tu sesión expiró. Ingresa nuevamente.';
      } else if (reason === 'logged_out') {
        this.error = 'Cerraste sesión correctamente.';
      }
    } catch {}
  }

  submit() {
    this.error = '';
    const e = this.email.trim();
    const p = this.password;
    if (!e || !p) { this.error = 'Ingrese email y contraseña'; return; }
    this.loading = true;
    this.auth.login(e, p).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.router.navigateByUrl('/');
        } else {
          this.error = res.message || 'Error al iniciar sesión';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = (err?.error?.message || err?.error?.error || 'Credenciales inválidas');
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
