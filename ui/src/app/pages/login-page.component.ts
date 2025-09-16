import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
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

  constructor(private auth: AuthService, private router: Router) {}

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
