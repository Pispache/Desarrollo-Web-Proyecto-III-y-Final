import { Component, HostListener, OnDestroy, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationStart, NavigationEnd } from '@angular/router';
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
  booting = false;
  private sub?: Subscription;
  private reloadSub?: Subscription;
  private navSub?: Subscription;
  private didInitialBoot = false;
  private bootTimeout?: any;
  private lastAuthed = false;
  authed = false;
  private cameFromLogin = false;
  private bootStartedAt: number | null = null;
  private readonly MIN_BOOT_MS = 1500;
  private readonly OAUTH_BOOT_MS = 1900;
  private oauthFlow = false;
  constructor(
    private sound: SoundService,
    private auth: AuthService,
    private ui: UiEventsService,
    private router: Router,
    private themeSvc: ThemeService,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    // Si el login marcó una intención de mostrar overlay, activar al inicio y limpiar
    try {
      const boot = sessionStorage.getItem('ui.boot');
      if (boot === '1') {
        this.booting = true; this.syncBootBodyClass();
        sessionStorage.removeItem('ui.boot');
      }
      // Protección extra para flujos OAuth: si venimos con ?token= en la URL inicial
      const hasOAuthToken = typeof window !== 'undefined' && (window.location.href || '').includes('token=');
      if (hasOAuthToken && !this.booting) {
        this.booting = true; this.syncBootBodyClass();
        this.cameFromLogin = true;
        this.oauthFlow = true;
      }
    } catch {}

    this.sub = this.auth.authed$.subscribe(isAuthed => {
      // No mostrar navbar inmediatamente; esperar a terminar navegación a la primera ruta
      this.applyRoleClass();
      this.lastAuthed = !!isAuthed;
      this.authed = !!isAuthed;
      if (isAuthed) {
        const url = this.router.url || '/';
        const atAuthPages = url.includes('login') || url.includes('registro');
        if (atAuthPages) {
          // Caso OAuth /login?token ...: usar overlay y navegar
          this.cameFromLogin = true;
          this.showNavbar = false;
          this.router.navigateByUrl('/', { replaceUrl: true });
        } else {
          // Si venimos del login y aún no se completó el boot inicial, no apagues aquí el overlay.
          // Deja que NavigationEnd cierre con mínimo via endBootWithMinimum().
          if (!this.didInitialBoot && this.cameFromLogin) {
            this.showNavbar = false;
          } else {
            // Ya estamos fuera de /login y no es primer boot: mostrar navbar y apagar overlay.
            this.showNavbar = true;
            this.booting = false; this.syncBootBodyClass();
            this.didInitialBoot = true; // no volver a mostrar overlay
            this.cameFromLogin = false;
          }
        }
      } else {
        this.showNavbar = false;
        this.booting = false; this.syncBootBodyClass();
        this.didInitialBoot = false;
        this.cameFromLogin = false;
      }
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

    // Mantener overlay SOLO una vez: al salir de /login hacia la primera ruta autenticada
    this.navSub = this.router.events.subscribe(ev => {
      if (ev instanceof NavigationStart) {
        // Si el login por formulario dejó una bandera, activarla y limpiar
        try {
          const mark = sessionStorage.getItem('ui.boot');
          if (mark === '1') {
            this.cameFromLogin = true;
            sessionStorage.removeItem('ui.boot');
          }
        } catch {}
        // Si no hay marca pero la URL lleva token= (OAuth callback directo), tratar como login
        const urlStr = (ev.url || '');
        const hasToken = urlStr.includes('token=');
        // Si navegamos a páginas de autenticación, ocultar la navbar de inmediato
        const goingToAuthPages = urlStr.includes('login') || urlStr.includes('registro');
        if (goingToAuthPages) {
          this.zone.run(() => { this.showNavbar = false; });
        }
        if (hasToken) { this.cameFromLogin = true; this.oauthFlow = true; }
        if (!this.didInitialBoot && (this.cameFromLogin)) {
          this.startBoot();
        }
      }
      if (ev instanceof NavigationEnd) {
        const nowAtAuthPages = ((this.router.url || '').includes('login') || (this.router.url || '').includes('registro'));
        if (!this.didInitialBoot && !nowAtAuthPages) {
          // Primera ruta autenticada lista
          this.showNavbar = this.lastAuthed;
          this.endBootWithMinimum();
          this.didInitialBoot = true;
          this.cameFromLogin = false;
        } else if (this.didInitialBoot) {
          // En siguientes navegaciones nunca usamos overlay global
          this.booting = false; this.syncBootBodyClass();
          if (this.bootTimeout) { clearTimeout(this.bootTimeout); this.bootTimeout = undefined; }
          this.showNavbar = !nowAtAuthPages && this.lastAuthed;
        }
      }
    });
  }

  

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.reloadSub?.unsubscribe();
    this.navSub?.unsubscribe();
  }

  @HostListener('document:click') onClick() { this.armAudio(); }
  @HostListener('document:keydown') onKey() { this.armAudio(); }
  @HostListener('document:touchstart') onTouch() { this.armAudio(); }

  // Permitir que otras vistas (p.ej. Login) enciendan/apaguen el overlay global
  @HostListener('window:uiBootOn') onBootOn() {
    this.startBoot();
  }
  @HostListener('window:uiBootOff') onBootOff() {
    this.endBootWithMinimum();
  }

  // Maneja restauración desde el Back/Forward Cache del navegador
  @HostListener('window:pageshow', ['$event'])
  onPageShow(ev: PageTransitionEvent) {
    try {
      const url = this.router.url || '';
      const atAuthPages = url.includes('login') || url.includes('registro');
      this.zone.run(() => {
        if (atAuthPages) {
          // Asegura que no quede sesión ni navbar al volver con Atrás
          this.auth.logout(false, 'manual', 'guard');
          this.showNavbar = false;
          this.booting = false; this.syncBootBodyClass();
          try { document.body.classList.add('auth-page'); } catch {}
        } else {
          // Re-sincroniza visibilidad de navbar por si quedó DOM restaurado
          this.showNavbar = this.lastAuthed && !atAuthPages;
          try { document.body.classList.remove('auth-page'); } catch {}
        }
      });
    } catch {}
  }

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
    const temp = url.startsWith('/control') ? '/resultados' : '/control';
    try {
      await this.router.navigateByUrl(temp);
      await this.router.navigateByUrl(url);
    } catch {}
  }

  private startBoot() {
    this.booting = true;
    this.bootStartedAt = Date.now();
    this.syncBootBodyClass();
    // Watchdog (apaga a los 5s si algo falla)
    if (this.bootTimeout) { clearTimeout(this.bootTimeout); }
    this.bootTimeout = setTimeout(() => {
      this.booting = false; this.syncBootBodyClass(); this.bootTimeout = undefined; this.bootStartedAt = null;
    }, 5000);
  }

  private endBootWithMinimum(extraDelayMs: number = 0) {
    if (!this.booting) { this.syncBootBodyClass(); return; }
    const started = this.bootStartedAt ?? Date.now();
    const elapsed = Date.now() - started;
    const minMs = this.oauthFlow ? this.OAUTH_BOOT_MS : this.MIN_BOOT_MS;
    const remain = Math.max(0, minMs - elapsed) + extraDelayMs;
    if (this.bootTimeout) { clearTimeout(this.bootTimeout); this.bootTimeout = undefined; }
    setTimeout(() => {
      this.booting = false;
      this.syncBootBodyClass();
      this.bootStartedAt = null;
      this.oauthFlow = false;
    }, remain);
  }

  private syncBootBodyClass() {
    try { document.body.classList.toggle('booting', this.booting); } catch {}
  }

}
