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

  constructor(private http: HttpClient, private router: Router, private notify: NotificationService) {
    // Verificar expiración al iniciar
    const token = this.getToken();
    if (token && this.isExpired()) {
      this.logout(true, 'expired');
    } else if (token) {
      this.scheduleAutoLogout();
      this._authed$.next(true);
    }
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { username, password }).pipe(
      tap(res => {
        this.safeSetItem(TOKEN_KEY, res.accessToken);
        this.safeSetItem(EXPIRES_KEY, res.expiresAt ?? '');
        this._authed$.next(true);
        this.scheduleAutoLogout();
      })
    );
  }

  logout(navigate: boolean = true, reason?: 'expired' | 'manual' | string): void {
    this.safeRemoveItem(TOKEN_KEY);
    this.safeRemoveItem(EXPIRES_KEY);
    this._authed$.next(false);
    if (this.logoutTimer) { clearTimeout(this.logoutTimer); this.logoutTimer = undefined; }
    if (reason === 'expired') {
      try { this.notify.showInfo('Sesión expirada', 'Tu sesión ha expirado. Inicia sesión nuevamente.', 3000); } catch {}
    }
    if (navigate) this.router.navigateByUrl('/login');
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
