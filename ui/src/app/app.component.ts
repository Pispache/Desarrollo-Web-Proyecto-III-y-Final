import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { NotificationDisplayComponent } from './components/notification-display.component';
import { NavbarComponent } from './components/navbar.component';
import { SoundService } from './services/sound.service';
import { AuthService } from './services/auth.service';
import { Subscription } from 'rxjs';
import { UiEventsService } from './services/ui-events.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NotificationDisplayComponent, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  private armed = false;
  showNavbar = false;
  private sub?: Subscription;
  private reloadSub?: Subscription;
  constructor(
    private sound: SoundService,
    private auth: AuthService,
    private ui: UiEventsService,
    private router: Router,
    private themeSvc: ThemeService,
  ) {}

  ngOnInit(): void {
    this.sub = this.auth.authed$.subscribe(isAuthed => {
      this.showNavbar = isAuthed;
      this.applyRoleClass();
    });
    // Aplicar al cargar por si ya hay sesión activa
    this.applyRoleClass();

    // Aplicar el tema al iniciar la aplicación basado en preferencia guardada
    // Usa variables CSS y atributo data-theme en <html> (ver ThemeService y _theme.scss)
    try {
      this.themeSvc.applyTheme(this.themeSvc.getTheme());
    } catch {}

    // Escuchar petición global de "Actualizar" desde la navbar
    this.reloadSub = this.ui.reloadAll$.subscribe(() => {
      this.softRefreshCurrentView();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.reloadSub?.unsubscribe();
  }

  @HostListener('document:click') onClick() { this.armAudio(); }
  @HostListener('document:keydown') onKey() { this.armAudio(); }
  @HostListener('document:touchstart') onTouch() { this.armAudio(); }

  private armAudio() {
    if (this.armed) return;
    this.armed = true;
    this.sound.preloadAll();
    this.sound.unlock();
  }

  private applyRoleClass() {
    try {
      const isAdmin = this.auth.isAdmin();
      const body = document.body;
      body.classList.toggle('role-admin', isAdmin);
      body.classList.toggle('role-user', !isAdmin);
    } catch {}
  }

  // Fuerza una recarga suave de la vista actual. Para /control navega a otra ruta y regresa.
  private async softRefreshCurrentView() {
    const url = this.router.url || '/control';
    // Truco: navegar a otra ruta existente sin cambiar el historial y luego regresar
    const temp = url.startsWith('/control') ? '/resultados' : '/control';
    try {
      await this.router.navigateByUrl(temp);
      await this.router.navigateByUrl(url);
    } catch {}
  }

}
