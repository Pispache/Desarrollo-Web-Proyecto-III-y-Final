import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NotificationService, Notification, VisualEffect } from '../services/notification.service';

@Component({
  selector: 'app-notification-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Toasts -->
    <div class="notification-container">
      <div
        *ngFor="let n of notifications"
        class="notification-toast"
        [class.toast-success]="n.type === 'success'"
        [class.toast-info]="n.type === 'info'"
        [class.toast-warning]="n.type === 'warning'"
        [class.toast-error]="n.type === 'error'">
        <div class="toast-header">
          <span class="toast-icon">{{ getIcon(n.type) }}</span>
          <strong class="toast-title">{{ n.title }}</strong>
          <button class="toast-close" (click)="remove(n.id)" aria-label="Cerrar">×</button>
        </div>
        <div class="toast-body">{{ n.message }}</div>
      </div>
    </div>

    <!-- Capa de efectos visuales -->
    <div class="effects-layer"
         *ngIf="currentEffect"
         [class.fx-flash]="currentEffect.type === 'flash'"
         [class.fx-glow]="currentEffect.type === 'glow'"
         [class.fx-shake]="currentEffect.type === 'shake'"
         [class.fx-pulse]="currentEffect.type === 'pulse'"
         [style.--fx-color]="currentEffect.color || '#00e5ff'">
    </div>
  `,
  styles: [`
    :host { position: relative; }

    /* Contenedor arriba-derecha */
    .notification-container{
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 9999;
      pointer-events: none;
    }

    .notification-toast{
      width: 320px;
      max-width: 85vw;
      background: #14122b;
      border: 1px solid #2b2a4a;
      color: #e7e9ff;
      border-radius: 12px;
      box-shadow: 0 10px 24px rgba(0,0,0,.35);
      overflow: hidden;
      transform: translateX(20px);
      opacity: .01;
      animation: slideIn .22s ease-out forwards;
      pointer-events: auto;
    }
    @keyframes slideIn { to { transform: translateX(0); opacity: 1; } }

    .toast-header{
      display:flex; align-items:center; gap:10px;
      padding:10px 12px; font-weight:600; letter-spacing:.2px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      background: rgba(255,255,255,.02);
    }
    .toast-title{ flex:1; }
    .toast-icon{ font-size: 18px; line-height: 1; }
    .toast-close{
      background: transparent; border: 0; color: #9aa0bd; cursor: pointer;
      font-size: 18px; width: 28px; height: 28px; border-radius: 6px;
    }
    .toast-close:hover{ background: rgba(255,255,255,.06); color: #fff; }
    .toast-body{ padding: 10px 12px 12px; color: #cfd3f7; font-size: 14px; }

    .toast-success{ border-color:#1f6b4b; box-shadow:0 10px 24px rgba(31,107,75,.35); }
    .toast-info   { border-color:#165c7a; box-shadow:0 10px 24px rgba(22,92,122,.35); }
    .toast-warning{ border-color:#7a6a16; box-shadow:0 10px 24px rgba(122,106,22,.35); }
    .toast-error  { border-color:#7a2b2b; box-shadow:0 10px 24px rgba(122,43,43,.35); }

    .effects-layer{ position: fixed; inset: 0; pointer-events: none; z-index: 9998; }

    .fx-flash{
      animation: flashAnim .65s ease-out;
      background: radial-gradient(800px 400px at 50% 50%, color-mix(in srgb, var(--fx-color) 40%, transparent), transparent 60%);
    }
    @keyframes flashAnim { 0% {opacity:0;} 10% {opacity:.8;} 100% {opacity:0;} }

    .fx-glow::after{
      content:""; position:absolute; inset:0;
      box-shadow: 0 0 160px 40px var(--fx-color) inset, 0 0 120px 20px var(--fx-color);
      opacity:.22; animation: glowAnim .9s ease-out forwards;
    }
    @keyframes glowAnim { to { opacity:0; } }

    .fx-shake{ animation: shakeAnim .45s ease-in-out; }
    @keyframes shakeAnim {
      0%,100% { transform: translateX(0); }
      20% { transform: translateX(-14px); }
      40% { transform: translateX(10px); }
      60% { transform: translateX(-6px); }
      80% { transform: translateX(4px); }
    }

    .fx-pulse::before{
      content:""; position:absolute; inset:0;
      background: color-mix(in srgb, var(--fx-color) 18%, transparent);
      animation: pulseAnim 1.1s ease-out forwards;
    }
    @keyframes pulseAnim { 0% {opacity:.2;} 100% {opacity:0;} }
  `]
})
export class NotificationDisplayComponent implements OnInit, OnDestroy {
  notifications: Notification[] = [];
  currentEffect: VisualEffect | null = null;
  private destroy$ = new Subject<void>();

  constructor(private svc: NotificationService) {}

  ngOnInit(): void {
    this.svc.getNotifications().pipe(takeUntil(this.destroy$)).subscribe(list => this.notifications = list);
    this.svc.getVisualEffects().pipe(takeUntil(this.destroy$)).subscribe(effect => this.currentEffect = effect);
  }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  remove(id: string){ this.svc.removeNotification(id); }
  getIcon(type: string): string {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' } as any;
    return icons[type] ?? 'ℹ️';
  }
}
