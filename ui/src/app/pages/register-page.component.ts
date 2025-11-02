import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.scss']
})
export class RegisterPageComponent {
  regName = '';
  regEmail = '';
  regPassword = '';
  regLoading = false;
  regError = '';
  regSuccess = '';

  constructor(private auth: AuthService, private router: Router) {}

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
}
