import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile-page.component.html',
  styleUrls: ['./profile-page.component.scss']
})
export class ProfilePageComponent {
  loading = false;
  error = '';
  users: Array<{ id:number; email:string; username:string; name:string; role:string; active:number|boolean; avatar?:string; last_login_at?:string }>=[];

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
}
