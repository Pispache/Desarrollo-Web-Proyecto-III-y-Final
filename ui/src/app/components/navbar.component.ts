import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  isMenuOpen = false;
  isAuthenticated = false;
  isAdmin = false;
  currentRoute = '';
  private authSubscription?: Subscription;
  private routerSubscription?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    // Suscribirse al estado de autenticación
    this.authSubscription = this.authService.authed$.subscribe(
      isAuth => {
        this.isAuthenticated = isAuth;
        this.isAdmin = isAuth ? this.authService.isAdmin() : false;
      }
    );

    // Suscribirse a cambios de ruta para cerrar el menú móvil
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.currentRoute = event.url;
        this.isMenuOpen = false;
      });

    // Obtener ruta inicial
    this.currentRoute = this.router.url;
  }

  ngOnDestroy() {
    this.authSubscription?.unsubscribe();
    this.routerSubscription?.unsubscribe();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu() {
    this.isMenuOpen = false;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
    this.closeMenu();
  }

  isActiveRoute(route: string): boolean {
    if (route === '/') {
      return this.currentRoute === '/' || this.currentRoute === '';
    }
    return this.currentRoute.startsWith(route);
  }

  // Navegación programática para rutas dinámicas
  navigateToDisplay() {
    // Aquí podrías obtener el ID del juego actual o mostrar un selector
    // Por ahora navegamos a una ruta genérica
    this.router.navigate(['/tablero', '1']);
    this.closeMenu();
  }

  // Acceso rápido a gestión de jugadores
  navigateToPlayers() {
    // Siempre dirigir al selector de equipo de jugadores
    this.router.navigate(['/jugadores']);
    this.closeMenu();
  }
}
