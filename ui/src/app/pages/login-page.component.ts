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
  username = '';
  password = '';
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {
    // Mostrar mensajes según motivo de redirección
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
    const u = this.username.trim();
    const p = this.password;
    if (!u || !p) { this.error = 'Ingrese usuario y contraseña'; return; }
    this.loading = true;
    this.auth.login(u, p).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.loading = false;
        this.error = (err?.error?.error || 'Credenciales inválidas');
      }
    });
  }
}
