import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-account-inactive-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './account-inactive-page.component.html',
  styleUrls: ['./account-inactive-page.component.scss']
})
export class AccountInactivePageComponent {
  constructor(private router: Router) {}
  volverAlLogin() {
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
