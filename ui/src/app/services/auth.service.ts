import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { NotificationService } from './notification.service';

interface LoginResponse { accessToken: string; expiresAt: string; }

const TOKEN_KEY = 'auth.token';
const EXPIRES_KEY = 'auth.expiresAt';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = '/api/auth';
  private _authed$ = new BehaviorSubject<boolean>(!!this.getToken());
  readonly authed$ = this._authed$.asObservable();
  private logoutTimer?: any;
  private bc?: BroadcastChannel;
  private isLoggingOut = false; // evita duplicados por múltiples disparadores

  constructor(private http: HttpClient, private router: Router, private notify: NotificationService) {
    // Verificar expiración al iniciar
    const token = this.getToken();
    if (token && this.isExpired()) {
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

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { username, password }).pipe(
      tap(res => {
        this.safeSetItem(TOKEN_KEY, res.accessToken);
        this.safeSetItem(EXPIRES_KEY, res.expiresAt ?? '');
        this._authed$.next(true);
        this.scheduleAutoLogout();
        // Notificar a otras pestañas que hay sesión activa (opcional)
        try { this.bc?.postMessage({ type: 'login' }); } catch {}
      })
    );
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
    const token = this.getToken();
    if (!token) return null;
    
    try {
      // Decodificar el JWT (solo la parte del payload) soportando base64url
      const part = token.split('.')[1];
      if (!part) return null;
      let base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad) base64 = base64 + '='.repeat(4 - pad);
      const json = atob(base64);
      const payload = JSON.parse(json);
      // El claim de rol en .NET suele ser ClaimTypes.Role
      return payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role']
        || payload['role']
        || payload['roles']?.[0]
        || null;
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }

  isAdmin(): boolean {
    const role = this.getUserRole();
    return role === 'ADMIN';
  }

  // Obtiene un nombre de usuario legible del JWT, probando varios claims comunes
  getUsername(): string | null {
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
      return (
        payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
        payload['name'] ||
        payload['preferred_username'] ||
        payload['unique_name'] ||
        payload['email'] ||
        payload['sub'] ||
        null
      );
    } catch {
      return null;
    }
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
