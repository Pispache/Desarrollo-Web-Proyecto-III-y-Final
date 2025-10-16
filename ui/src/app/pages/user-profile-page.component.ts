import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-user-profile-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-profile-page.component.html',
  styleUrls: ['./user-profile-page.component.scss']
})
export class UserProfilePageComponent {
  user: any = null;

  constructor(private auth: AuthService) {
    this.user = this.auth.getCurrentUser();
  }
}
