import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent {
  loading = false;
  error = '';
  users: Array<{ id:number; email:string; username:string; name:string; role:string; active:number|boolean; avatar?:string; last_login_at?:string }>=[];
  roles: Array<'viewer'|'operator'|'admin'> = ['viewer','operator','admin'];
  saving: Record<number, boolean> = {};

  constructor(private auth: AuthService) {
    this.reload();
  }

  reload() {
    this.loading = true; this.error = '';
    this.auth.listUsers().subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.users = res.users || [];
        } else {
          this.error = 'No se pudieron cargar los usuarios';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'No se pudieron cargar los usuarios';
      }
    });
  }

  onRoleChange(u: { id:number; role:string }, newRole: 'viewer'|'operator'|'admin') {
    if (!u || !newRole || u.role === newRole) return;
    this.saving[u.id] = true;
    this.error = '';
    this.auth.updateUserRole(u.id, newRole).subscribe({
      next: (res) => {
        this.saving[u.id] = false;
        if (res?.success && res.user) {
          u.role = res.user.role;
        } else {
          this.error = 'No se pudo actualizar el rol';
        }
      },
      error: (err) => {
        this.saving[u.id] = false;
        this.error = err?.error?.message || 'Error al actualizar el rol';
      }
    });
  }
}
