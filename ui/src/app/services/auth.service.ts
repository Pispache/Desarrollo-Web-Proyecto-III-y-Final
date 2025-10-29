/**
 * @summary Servicio de autenticación del Frontend (Angular).
 * @remarks
 * - Administra el ciclo de vida del JWT (almacenamiento, expiración y auto-logout).\
 * - Sincroniza el cierre de sesión entre pestañas usando `BroadcastChannel` y el evento `storage`.\
 * - Expone estado reactivo `authed$`, helpers de rol/usuario y utilidades de navegación.\
 * - Interactúa con el Auth Service Node.js por medio del proxy Nginx (`/auth/api/auth`).
 */
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { NotificationService } from './notification.service';

interface LoginResponse { 
  success: boolean;
  message: string;
  user: {
    id: number;
    email: string;
    username: string;
    name: string;
    role: string;
    avatar?: string;
  };
  token: {
    access_token: string;
    token_type: string;
    expires_in: string;
  };
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  username?: string;
}

const TOKEN_KEY = 'auth.token';
const EXPIRES_KEY = 'auth.expiresAt';
const USER_KEY = 'auth.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = '/api/auth'; // Proxy Nginx del VPS hacia Auth Service Node.js
  private _authed$ = new BehaviorSubject<boolean>(!!this.getToken());
  readonly authed$ = this._authed$.asObservable();
  private logoutTimer?: any;
  private bc?: BroadcastChannel;
  private isLoggingOut = false; // evita duplicados por múltiples disparadores

  constructor(private http: HttpClient, private router: Router, private notify: NotificationService) {
    // Verificar expiración al iniciar (pero no en página de login con token OAuth)
    const token = this.getToken();
    const isOAuthCallback = typeof window !== 'undefined' && window.location.href.includes('token=');
    
    if (token && this.isExpired() && !isOAuthCallback) {
      this.logout(true, 'expired');
    } else if (token) {
      this.scheduleAutoLogout();
      this._authed$.next(true);
    }

    // Sincronización entre pestañas: BroadcastChannel (principal)
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.bc = new BroadcastChannel('auth');
        this.bc.onmessage = (ev: MessageEvent) => {
          const msg = ev.data as { type: string; reason?: string };
          if (msg?.type === 'logout') {
            // No notificar aquí para evitar duplicados; centralizar en logout
            this.logout(true, msg.reason || 'expired', 'external');
          }
        };
      }
    } catch {}

    // Fallback: evento storage por cambios en localStorage
    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', (e: StorageEvent) => {
          if (e.key === TOKEN_KEY && e.newValue === null) {
            // Centralizar en logout
            this.logout(true, 'expired', 'external');
          }
        });
      }
    } catch {}
  }

  /**
   * @summary Realiza login con email/contraseña contra el Auth Service.
   * @remarks
   * - Persiste el JWT y programa auto-logout (60 minutos por defecto).\
   * - Emite estado autenticado y notifica a otras pestañas.
   */
  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { email, password }).pipe(
      tap(res => {
        if (res.success) {
          this.safeSetItem(TOKEN_KEY, res.token.access_token);
          // Calcular expiración (1 hora por defecto)
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          this.safeSetItem(EXPIRES_KEY, expiresAt);
          this.safeSetItem(USER_KEY, JSON.stringify(res.user));
          this._authed$.next(true);
          this.scheduleAutoLogout();
          // Notificar a otras pestañas que hay sesión activa (opcional)
          try { this.bc?.postMessage({ type: 'login' }); } catch {}
        }
      })
    );
  }

  // Nuevo método de registro
  /**
   * @summary Registro de usuario (email/contraseña) en el Auth Service.
   * @remarks
   * - Tras registrar, inicia sesión automáticamente y emite estado autenticado.
   */
  register(data: RegisterData): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/register`, data).pipe(
      tap(res => {
        if (res.success) {
          this.safeSetItem(TOKEN_KEY, res.token.access_token);
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          this.safeSetItem(EXPIRES_KEY, expiresAt);
          this.safeSetItem(USER_KEY, JSON.stringify(res.user));
          this._authed$.next(true);
          this.scheduleAutoLogout();
          try { this.bc?.postMessage({ type: 'login' }); } catch {}
        }
      })
    );
  }

  // OAuth login methods
  loginWithGoogle(): void {
    window.location.href = `${this.base}/google`;
  }

  loginWithFacebook(): void {
    window.location.href = `${this.base}/facebook`;
  }

  /**
   * @summary Inicia el flujo OAuth con GitHub redirigiendo al backend.
   * @remarks
   * - El backend maneja el `redirect_uri` y el intercambio del código por token.\
   * - Tras el callback, la UI recibe el JWT vía `handleOAuthCallback()`.
   * redirige a https://tobarumg.lat/api/auth/github.
   */
  loginWithGitHub(): void {
    window.location.href = `${this.base}/github`;
  }

  // Admin: listar usuarios del Auth Service
  /**
   * @summary Lista usuarios (restringido a administradores).
   */
  listUsers(): Observable<{ success: boolean; users: any[] }> {
    const token = this.getToken();
    return this.http.get<{ success: boolean; users: any[] }>(`${this.base}/users`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  }

  // Admin: actualizar rol de usuario
  /**
   * @summary Actualiza el rol de un usuario (requiere token de admin).
   * @param userId Identificador del usuario a actualizar
   * @param role Nuevo rol (`viewer`, `operator` o `admin`)
   */
  updateUserRole(userId: number, role: 'viewer' | 'operator' | 'admin'): Observable<{ success: boolean; user: any }> {
    const token = this.getToken();
    return this.http.patch<{ success: boolean; user: any }>(`${this.base}/users/${userId}/role`, { role }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).pipe(
      tap(res => {
        // Si el admin se cambia su propio rol, actualizar cache de usuario
        const me = this.getCurrentUser();
        if (res.success && me && me.id === userId) {
          const updated = { ...me, role: res.user?.role || role };
          this.safeSetItem(USER_KEY, JSON.stringify(updated));
        }
      })
    );
  }

  // Obtener usuario actual
  /**
   * @summary Devuelve el usuario actual desde almacenamiento local.
   */
  getCurrentUser(): any {
    const userStr = this.safeGetItem(USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  // Manejar callback de OAuth
  /**
   * @summary Maneja el callback de OAuth recibiendo el JWT del backend.
   * @remarks
   * - Persiste el token, programa auto-logout y consulta los datos del usuario con `/me`.
   */
  handleOAuthCallback(token: string): void {
    this.safeSetItem(TOKEN_KEY, token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    this.safeSetItem(EXPIRES_KEY, expiresAt);
    this._authed$.next(true);
    this.scheduleAutoLogout();
    // Cargar información del usuario
    this.http.get<{ success: boolean; user: any }>(`${this.base}/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.safeSetItem(USER_KEY, JSON.stringify(res.user));
          // Re-emitir estado autenticado para notificar que ya hay usuario cargado
          this._authed$.next(true);
        }
      }
    });
  }

  /**
   * @summary Cierra sesión localmente y sincroniza con otras pestañas.
   * @param navigate Si `true`, redirige a `/login`.
   * @param reason Motivo del cierre (p.ej., `expired`, `logged_out`).
   * @param origin Origen del evento (`local`, `external`, `interceptor`, `guard`).
   */
  logout(
    navigate: boolean = true,
    reason?: 'expired' | 'logged_out' | 'manual' | string,
    origin: 'local' | 'external' | 'interceptor' | 'guard' = 'local'
  ): void {
    if (this.isLoggingOut) return; // dedupe
    this.isLoggingOut = true;
    setTimeout(() => (this.isLoggingOut = false), 500);

    this.safeRemoveItem(TOKEN_KEY);
    this.safeRemoveItem(EXPIRES_KEY);
    this.safeRemoveItem(USER_KEY);
    this._authed$.next(false);
    if (this.logoutTimer) { clearTimeout(this.logoutTimer); this.logoutTimer = undefined; }

    // Mensajería unificada (una sola vez)
    if (reason === 'expired') {
      const msg = origin === 'external'
        ? 'Tu sesión se cerró en otra pestaña (token vencido).'
        : 'Tu sesión ha expirado';
      try { this.notify.showInfo(msg, origin === 'external' ? 'Sesión cerrada' : 'Inicia sesión nuevamente.', 3000); } catch {}
    } else if (reason === 'logged_out') {
      try { this.notify.showInfo('Cerraste sesión correctamente.', '', 2000); } catch {}
    }

    // Avisar a otras pestañas solo si el origen es local o interceptor (no rebote por external)
    if (origin !== 'external') {
      try { this.bc?.postMessage({ type: 'logout', reason }); } catch {}
    }
    if (navigate) this.router.navigate(['/login'], { queryParams: { reason: reason === 'logged_out' ? 'logged_out' : 'expired' } });
  }

  /**
   * @summary Obtiene el token actual del almacenamiento.
   */
  getToken(): string | null {
    return this.safeGetItem(TOKEN_KEY);
  }

  /**
   * @summary Indica si el usuario está autenticado y el token es válido/no expirado.
   */
  isAuthenticated(): boolean {
    const t = this.getToken();
    return !!t && t.length > 0 && !this.isExpired();
  }

  /**
   * @summary Devuelve la fecha de expiración del token si existe.
   */
  getExpiresAt(): Date | null {
    const raw = this.safeGetItem(EXPIRES_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * @summary Verifica si el token ha expirado.
   */
  isExpired(): boolean {
    const exp = this.getExpiresAt();
    if (!exp) return false;
    return Date.now() >= exp.getTime();
  }

  /**
   * @summary Obtiene el rol del usuario desde cache o decodificando el JWT.
   */
  getUserRole(): string | null {
    const user = this.getCurrentUser();
    if (user?.role) return user.role;
    
    // Fallback: decodificar del JWT
    const token = this.getToken();
    if (!token) return null;
    
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      let base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) base64 = base64 + '='.repeat(4 - pad);
      const json = atob(base64);
      const payload = JSON.parse(json);
      return payload['role'] || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || null;
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }

  /**
   * @summary Indica si el usuario tiene rol de administrador.
   */
  isAdmin(): boolean {
    const role = this.getUserRole();
    return role === 'admin' || role === 'ADMIN';
  }

  /**
   * @summary Indica si el usuario tiene rol de operador o superior.
   */
  isOperator(): boolean {
    const role = this.getUserRole();
    return role === 'operator' || role === 'admin' || role === 'ADMIN';
  }

  // Obtiene un nombre de usuario legible
  /**
   * @summary Obtiene un nombre presentable del usuario actual.
   */
  getUsername(): string | null {
    const user = this.getCurrentUser();
    return user?.name || user?.username || user?.email || null;
  }

  /**
   * @summary Programa un cierre de sesión automático al llegar la expiración.
   */
  private scheduleAutoLogout(): void {
    if (this.logoutTimer) { clearTimeout(this.logoutTimer); this.logoutTimer = undefined; }
    const exp = this.getExpiresAt();
    if (!exp) return;
    const ms = Math.max(0, exp.getTime() - Date.now());
    this.logoutTimer = setTimeout(() => this.logout(true, 'expired'), ms);
  }

  // ===== Safe storage helpers (avoid SSR errors) =====
  private hasStorage(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }
  private safeGetItem(key: string): string | null {
    try { return this.hasStorage() ? window.localStorage.getItem(key) : null; } catch { return null; }
  }
  private safeSetItem(key: string, value: string): void {
    try { if (this.hasStorage()) window.localStorage.setItem(key, value); } catch {}
  }
  private safeRemoveItem(key: string): void {
    try { if (this.hasStorage()) window.localStorage.removeItem(key); } catch {}
  }
}
