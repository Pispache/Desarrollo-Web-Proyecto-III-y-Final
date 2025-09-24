import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, TeamDto } from '../services/api.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-team-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './team-register-page.component.html',
  styleUrls: ['./team-register-page.component.scss']
})
export class TeamRegisterPageComponent {
  name = '';
  city = '';
  file: File | null = null;
  previewUrl: string | null = null;
  busy = false;

  constructor(private api: ApiService, private notify: NotificationService, private router: Router) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files && input.files[0];
    if (!f) { this.file = null; this.clearPreview(); return; }
    // Validación básica en cliente
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(f.type)) {
      this.notify.showError('Formato no soportado', 'Usa PNG/JPG/WEBP', true);
      input.value = '';
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      this.notify.showError('Archivo muy grande', 'Límite 2MB', true);
      input.value = '';
      return;
    }
    this.file = f;
    this.setPreview(f);
  }

  private setPreview(file: File) {
    this.clearPreview();
    const url = URL.createObjectURL(file);
    this.previewUrl = url;
  }

  clearPreview() {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }

  submit() {
    const name = this.name.trim();
    const city = this.city.trim();
    if (!name) {
      this.notify.showError('Validación', 'El nombre es requerido', false);
      return;
    }
    const fd = new FormData();
    fd.append('name', name);
    if (city) fd.append('city', city);
    if (this.file) fd.append('file', this.file);

    this.busy = true;
    this.api.createTeamWithLogo(fd).subscribe({
      next: (team: TeamDto) => {
        this.notify.showSuccess('Equipo creado', `"${team.name}" registrado correctamente`);
        // Redirigir al inicio o a otra página
        this.router.navigateByUrl('/');
      },
      error: (err) => {
        const msg = err?.error?.error || 'No se pudo crear el equipo';
        this.notify.showError('Error', msg, true);
      },
      complete: () => { this.busy = false; }
    });
  }
}
