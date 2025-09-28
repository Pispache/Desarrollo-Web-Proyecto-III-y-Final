/**
 * summary:
 *   Servicio de notificaciones visuales (toasts/banners) para la UI.
 * remarks:
 *   - Expone helpers `showSuccess`, `showInfo`, `showWarning`, `showError`.
 *   - Centraliza textos y duraciones para mensajes consistentes.
 *   - Ofrece detonadores visuales (p.ej., efectos de score/foul) si aplica.
 */
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  sticky?: boolean;
  duration?: number; // ms
  createdAt: number;
}

export type VisualEffectType = 'flash' | 'glow' | 'shake' | 'pulse';

export interface VisualEffect {
  type: VisualEffectType;
  color?: string;
  until?: number; // timestamp ms (auto-clear)
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notifications$ = new BehaviorSubject<Notification[]>([]);
  private effects$ = new BehaviorSubject<VisualEffect | null>(null);
  private idSeq = 0;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  // Observables
  getNotifications(): Observable<Notification[]> { return this.notifications$.asObservable(); }
  getVisualEffects(): Observable<VisualEffect | null> { return this.effects$.asObservable(); }

  // Helpers
  private nextId(): string { return `n${Date.now()}_${++this.idSeq}`; }

  private push(n: Notification) {
    const list = this.notifications$.value.slice();
    list.unshift(n);
    this.notifications$.next(list);

    if (!n.sticky) {
      const duration = n.duration ?? 2000;
      // Use global timer to avoid referencing window during SSR
      setTimeout(() => this.removeNotification(n.id), duration);
    }
  }

  removeNotification(id: string) {
    const list = this.notifications$.value.filter((n: Notification) => n.id !== id);
    this.notifications$.next(list);
  }

  // API de toasts
  showNotification(type: NotificationType, title: string, message: string, duration?: number | boolean) {
    const sticky = duration === true;
    const dur = typeof duration === 'number' ? duration : undefined;
    this.push({
      id: this.nextId(),
      type, title, message,
      sticky,
      duration: dur,
      createdAt: Date.now()
    });
  }

  showSuccess(title: string, message: string, duration?: number | boolean) {
    this.showNotification('success', title, message, duration);
  }
  showInfo(title: string, message: string, duration?: number | boolean) {
    this.showNotification('info', title, message, duration);
  }
  showWarning(title: string, message: string, duration?: number | boolean) {
    this.showNotification('warning', title, message, duration);
  }
  showError(title: string, message: string, duration?: number | boolean) {
    this.showNotification('error', title, message, duration);
  }

  // Confirmaciones (implementar modal real más adelante si se desea)
  async confirm(message: string, title = 'Confirmación'): Promise<boolean> {
    // Evitar uso de window en SSR
    if (!isPlatformBrowser(this.platformId)) {
      return Promise.resolve(false);
    }
    try {
      const ok = window.confirm(`${title}\n\n${message}`);
      return Promise.resolve(ok);
    } catch {
      return Promise.resolve(false);
    }
  }

  // Efectos visuales
  private trigger(effect: VisualEffectType, color?: string, ms = 700) {
    const until = Date.now() + ms;
    this.effects$.next({ type: effect, color, until });
    // Use global timer to avoid referencing window during SSR
    setTimeout(() => {
      if (this.effects$.value && this.effects$.value.until && Date.now() >= this.effects$.value.until) {
        this.effects$.next(null);
      }
    }, ms + 10);
  }

  triggerQuarterEndFlash() { this.trigger('flash', '#ff3b30', 650); }
  triggerScoreGlow()       { this.trigger('glow',  '#00e5ff', 900); }
  triggerFoulShake()       { this.trigger('shake', '#ffd60a', 450); }
  triggerTimeoutPulse()    { this.trigger('pulse', '#34c759', 1100); }
}
