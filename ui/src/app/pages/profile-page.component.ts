import { Component, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

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
  users: Array<{ id:number; email:string; username:string; name:string; role:string; active:number|boolean; avatar?:string; last_login_at?:string; has_password?: boolean }>=[];
  roles: Array<'viewer'|'operator'|'admin'> = ['viewer','operator','admin'];
  saving: Record<number, boolean> = {};
  private myId: number | null = null;
  openMenuId: number | null = null;

  // Filtro/orden/paginación
  q = '';
  sort: { key: 'id'|'email'|'username'|'name'|'role'|'last_login_at'; dir: 1|-1 } = { key: 'id', dir: 1 };
  page = 1;
  pageSize = 10;

  constructor(private auth: AuthService, private elRef: ElementRef, private notify: NotificationService) {
    const me = this.auth.getCurrentUser();
    this.myId = me?.id ?? null;
    this.reload();
  }

  onActionReset(u: { id:number; email:string; has_password?: boolean }) {
    if (!this.isAdmin() || !this.isLocalUser(u) || this.saving[u.id]) return;
    this.resetPassword(u);
    this.closeActions();
  }

  // Computed helpers
  get filtered(): typeof this.users {
    const q = (this.q || '').toLowerCase().trim();
    if (!q) return this.users.slice();
    return this.users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q)
    );
  }

  get sorted(): typeof this.users {
    const arr = this.filtered.slice();
    const { key, dir } = this.sort;
    arr.sort((a: any, b: any) => {
      const va = (a?.[key] ?? '');
      const vb = (b?.[key] ?? '');
      if (key === 'id') return (Number(va) - Number(vb)) * dir;
      if (key === 'last_login_at') return (new Date(va).getTime() - new Date(vb).getTime()) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return arr;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.sorted.length / this.pageSize));
  }
  get paged(): typeof this.users {
    const start = (this.page - 1) * this.pageSize;
    return this.sorted.slice(start, start + this.pageSize);
  }

  setSort(key: typeof this.sort.key) {
    if (this.sort.key === key) { this.sort.dir = (this.sort.dir === 1 ? -1 : 1); }
    else { this.sort = { key, dir: 1 }; }
  }
  goto(p: number) { this.page = Math.min(Math.max(1, p), this.totalPages); }

  // Acciones rápidas
  isLocalUser(u: any): boolean {
    return !!u?.has_password;
  }

  async resetPassword(u: { id:number; email:string }) {
    if (!this.auth.isAdmin()) return;
    const ok = confirm(`¿Resetear la contraseña de ${u.email}? Se generará una clave temporal.`);
    if (!ok) return;
    this.saving[u.id] = true; this.error = '';
    this.auth.resetUserPassword(u.id).subscribe({
      next: (res: any) => {
        this.saving[u.id] = false;
        if (res?.success) {
          const temp = res?.temporaryPassword;
          if (temp) {
            const doFallback = () => {
              try {
                const again = window.prompt('Contraseña temporal (copiar manualmente):', temp);
                if (again !== null) {
                  this.notify.showInfo('Contraseña temporal', 'Selecciona y copia la clave mostrada.', 3500);
                }
              } catch {}
            };
            try {
              const clip = (navigator as any)?.clipboard;
              if (clip && typeof clip.writeText === 'function') {
                clip.writeText(temp).then(() => {
                  try { this.notify.showSuccess('Contraseña reseteada', 'La contraseña temporal se copió al portapapeles.', 3000); } catch {}
                }).catch(() => doFallback());
              } else {
                doFallback();
              }
            } catch { doFallback(); }
          } else {
            try { this.notify.showSuccess('Contraseña reseteada', 'Se generó una nueva contraseña.', 2500); } catch {}
          }
        } else {
          this.error = res?.message || 'No se pudo resetear la contraseña';
          try { this.notify.showError('Error', this.error, 3000); } catch {}
        }
      },
      error: (err: any) => {
        this.saving[u.id] = false;
        this.error = err?.error?.message || 'Error al resetear la contraseña';
        try { this.notify.showError('Error', this.error, 3000); } catch {}
      }
    });
  }

  // Helpers para template
  isAdmin(): boolean { return this.auth.isAdmin(); }

  // === Menú Acciones ===
  toggleActions(id: number) {
    this.openMenuId = this.openMenuId === id ? null : id;
  }
  closeActions() { this.openMenuId = null; }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent) {
    const host: HTMLElement = this.elRef.nativeElement as HTMLElement;
    const actions = host.querySelector('.actions-cell');
    if (this.openMenuId && actions && !actions.contains(ev.target as Node)) {
      this.openMenuId = null;
    }
  }

  reload() {
    this.loading = true; this.error = '';
    this.auth.listUsers().subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.users = res.users || [];
          this.page = 1;
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

  canToggleActive(u: { id:number }): boolean {
    // Solo admins (controlado por backend) pero además evitar que modifiques tu propio usuario desde la UI
    // Aquí permitimos UI si no es tu propio usuario; el backend reforzará.
    return !!u && (this.myId == null || u.id !== this.myId) && this.auth.isAdmin();
  }

  onActiveToggle(u: { id:number; active:number|boolean }, checked: boolean) {
    if (!this.canToggleActive(u)) return;
    this.saving[u.id] = true;
    this.error = '';
    this.auth.updateUserActive(u.id, !!checked).subscribe({
      next: (res) => {
        this.saving[u.id] = false;
        if (res?.success && typeof res.user?.active !== 'undefined') {
          u.active = res.user.active;
        } else {
          this.error = 'No se pudo actualizar el estado';
        }
      },
      error: (err) => {
        this.saving[u.id] = false;
        this.error = err?.error?.message || 'Error al actualizar el estado';
      }
    });
  }
}
