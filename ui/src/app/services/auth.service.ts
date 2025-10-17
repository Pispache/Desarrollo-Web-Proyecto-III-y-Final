/**
 * summary:
 *   Servicio de autenticación (login, estado, cierre de sesión y roles).
 * remarks:
 *   - Gestiona el token JWT y su expiración (auto-logout programado).
 *   - Sincroniza cierre de sesión entre pestañas con BroadcastChannel y `storage`.
 *   - Expone estado reactivo `authed$`, helpers de rol/usuario y maneja navegación.
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
  private base = 'http://localhost:5001/api/auth'; // Auth Service Node.js
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

  loginWithGitHub(): void {
    window.location.href = `${this.base}/github`;
  }

  // Obtener usuario actual
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
        }
      }
    });
  }

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

  getToken(): string | null {
    return this.safeGetItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    const t = this.getToken();
    return !!t && t.length > 0 && !this.isExpired();
  }

  getExpiresAt(): Date | null {
    const raw = this.safeGetItem(EXPIRES_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  isExpired(): boolean {
    const exp = this.getExpiresAt();
    if (!exp) return false;
    return Date.now() >= exp.getTime();
  }

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

  isAdmin(): boolean {
    const role = this.getUserRole();
    return role === 'admin' || role === 'ADMIN';
  }

  isOperator(): boolean {
    const role = this.getUserRole();
    return role === 'operator' || role === 'admin' || role === 'ADMIN';
  }

  // Obtiene un nombre de usuario legible
  getUsername(): string | null {
    const user = this.getCurrentUser();
    return user?.name || user?.username || user?.email || null;
  }

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
