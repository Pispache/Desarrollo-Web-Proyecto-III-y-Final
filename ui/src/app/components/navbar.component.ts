/// <summary>
/// Barra de navegación principal de la aplicación.
/// </summary>
/// <remarks>
/// - Muestra enlaces para navegar a las secciones clave según el rol del usuario.
/// - Adapta su contenido si el usuario está autenticado o es administrador.
/// - Permite mostrar/ocultar un menú móvil tipo hamburguesa para pantallas pequeñas.
/// - Se actualiza dinámicamente al cambiar de ruta y al recibir eventos globales de la interfaz.
/// </remarks>

import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';
import { ThemeToggleComponent } from '../widgets/theme-toggle.component';
import { UiEventsService } from '../services/ui-events.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, ThemeToggleComponent],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  adminOpen = false;
  /** Preferencia: si el menú móvil tipo hamburguesa está habilitado */
  mobileMenuEnabled = true;
  isAuthenticated = false;
  isAdmin = false;
  username: string | null = null;
  role: string | null = null;
  avatarUrl: string | null = null;
  oauthProvider: string | null = null; // 'github' | 'google' | 'facebook' | null
  currentRoute = '';
  private authSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private uiEvents: UiEventsService,
    private elRef: ElementRef
  ) {}

  ngOnInit() {
    // Suscribirse al estado de autenticación
    this.authSubscription = this.authService.authed$.subscribe(
      isAuth => {
        this.isAuthenticated = isAuth;
        this.isAdmin = isAuth ? this.authService.isAdmin() : false;
        this.username = isAuth ? (this.authService.getUsername() || null) : null;
        this.role = isAuth ? (this.authService.getUserRole() || null) : null;
        // Intentar obtener avatar desde el usuario actual
        const me = isAuth ? this.authService.getCurrentUser() : null;
        /**
         * Avatar del usuario y proveedor OAuth
         * - avatarUrl: URL de imagen de perfil provista por el proveedor OAuth (GitHub/Google/Facebook) o null.
         * - oauthProvider: nombre del proveedor para mostrar el ícono/badge correspondiente en la UI.
         */
        this.avatarUrl = me?.avatar || null;
        this.oauthProvider = (me?.oauth_provider || me?.oauthProvider || null);
      }
    );

    // Suscribirse a cambios de ruta para cerrar el menú
    this.routerSubscription = this.router.events.subscribe(ev => {
      if (ev instanceof NavigationEnd) {
        this.currentRoute = ev.urlAfterRedirects;
        this.closeMenu();
      }
    });
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
    this.toggleBodyScroll(false);
  }

  // Cierra el menú móvil si se pasa a escritorio para evitar estados "pegados"
  @HostListener('window:resize')
  onWindowResize() {
    try {
      if (window.innerWidth >= 768 && this.isMenuOpen) {
        this.closeMenu();
      }
    } catch {}
  }

  isActiveRoute(route: string): boolean {
    return this.currentRoute.startsWith(route);
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    this.toggleBodyScroll(this.isMenuOpen);
  }

  closeMenu() {
    this.isMenuOpen = false;
    this.adminOpen = false;
    this.toggleBodyScroll(false);
  }

  // Navegación programática para rutas dinámicas (placeholder si se usa)
  navigateToDisplay() {
    this.router.navigate(['/tablero', '1']);
    this.closeMenu();
  }

  // Acceso rápido a gestión de jugadores
  navigateToPlayers() {
    this.router.navigate(['/jugadores']);
    this.closeMenu();
  }

  onRefresh() {
    // Emite un evento global para que las páginas relevantes recarguen datos
    this.uiEvents.triggerReloadAll();
  }

  logout() {
    this.authService.logout(true, 'logged_out');
    this.closeMenu();
  }

  // Bloquea/desbloquea el scroll del body cuando el menú móvil está abierto
  private toggleBodyScroll(lock: boolean) {
    try {
      document.body.classList.toggle('nav-open', !!lock);
    } catch {}
  }

  toggleAdminMenu(event: MouseEvent) {
    event.stopPropagation();
    this.adminOpen = !this.adminOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent) {
    if (!this.adminOpen) return;
    const host: HTMLElement = this.elRef.nativeElement;
    const dropdown = host.querySelector('.admin-dropdown');
    if (dropdown && !dropdown.contains(ev.target as Node)) {
      this.adminOpen = false;
    }
  }

  // ================= Preferencia de hamburguesa ON/OFF =================
  toggleMobileMenuMode() {
    this.mobileMenuEnabled = !this.mobileMenuEnabled;
    try { localStorage.setItem('ui.mobileMenu', this.mobileMenuEnabled ? 'on' : 'off'); } catch {}
    this.applyMobileMenuPref();
    // Si se desactiva, asegurarse de cerrar el menú
    if (!this.mobileMenuEnabled) this.closeMenu();
  }

  private loadMobileMenuPref() {
    try {
      const v = (localStorage.getItem('ui.mobileMenu') || 'on').toLowerCase();
      this.mobileMenuEnabled = (v !== 'off');
    } catch { this.mobileMenuEnabled = true; }
    this.applyMobileMenuPref();
  }

  private applyMobileMenuPref() {
    try {
      const root = document.documentElement;
      root.setAttribute('data-mobile-menu', this.mobileMenuEnabled ? 'on' : 'off');
    } catch {}
  }
}
