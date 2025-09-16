import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, AppTheme } from '../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button class="btn btn-outline-secondary" [ngClass]="sizeClass" (click)="toggle()" title="Cambiar tema">
      <i class="bi" [ngClass]="theme === 'light' ? 'bi-moon-stars' : 'bi-sun'"></i>
      <span class="ms-1">{{ theme === 'light' ? 'Oscuro' : 'Claro' }}</span>
    </button>
  `,
})
export class ThemeToggleComponent {
  @Input() size: 'sm' | 'md' = 'sm';
  theme: AppTheme = 'dark';

  constructor(private themeSvc: ThemeService) {
    this.theme = this.themeSvc.getTheme();
  }

  get sizeClass() {
    return this.size === 'sm' ? 'btn-sm' : '';
  }

  toggle() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.themeSvc.setTheme(this.theme);
  }
}
