import { Component, Input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable } from 'rxjs';
import { MsToClockPipe } from '../pipes/ms-to-clock.pipe';

/** Estados que la plantilla usa */
export type GameStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'SUSPENDED'
  | 'PAUSED'
  | 'CANCELLED';

interface ClockVM {
  quarterMs: number;
  autoAdvance: boolean;
}
interface VmSnap {
  running: boolean;
  remainingMs: number;
}

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, FormsModule, MsToClockPipe],
  templateUrl: './clock.component.html',
})
export class ClockComponent implements OnDestroy {
  /** Inputs ya usados por tu HTML */
  @Input() status?: GameStatus;         // [status]="d.game.status"
  @Input() quarter: number = 1;         // [quarter]="d.game.quarter"
  @Input() remainingMs: number = 0;     // si lo enlazan externamente
  @Input() gameId?: number | string;    // si se pasa desde el padre
  @Input() homeScore: number = 0;       // para isGameTied()
  @Input() awayScore: number = 0;

  /** NUEVOS Inputs que tu plantilla espera */
  @Input() controls: boolean = true;         // *ngIf="controls"
  @Input() showTeamFouls: boolean = false;   // [showTeamFouls]="false"
  @Input() teamFoulsHome: number = 0;
  @Input() teamFoulsAway: number = 0;
  @Input() bonusHome: boolean = false;
  @Input() bonusAway: boolean = false;

  /** ViewModel para (vm$ | async) */
  private vmSubject = new BehaviorSubject<ClockVM>({
    quarterMs: 10 * 60 * 1000, // 10 minutos por defecto
    autoAdvance: false,
  });
  vm$: Observable<ClockVM> = this.vmSubject.asObservable();

  /** Snapshot que la plantilla usa como vmSnap */
  vmSnap: VmSnap = { running: false, remainingMs: 0 };

  /** Estado UI */
  busy = false;

  private timerId: any = null;

  ngOnDestroy(): void { this.clearTimer(); }

  // -------- Helpers que tu HTML invoca --------
  getStatusText(): string {
    switch (this.status) {
      case 'SCHEDULED': return 'Programado';
      case 'IN_PROGRESS': return 'En juego';
      case 'PAUSED': return 'Pausado';
      case 'SUSPENDED': return 'Suspendido';
      case 'CANCELLED': return 'Cancelado';
      case 'FINISHED': return 'Finalizado';
      default: return '—';
    }
  }
  isOvertime(): boolean { return (this.quarter ?? 1) > 4; }
  getOvertimeNumber(): number { return (this.quarter ?? 1) > 4 ? (this.quarter - 4) : 0; }
  isLast30Seconds(): boolean {
    const ms = this.vmSnap?.remainingMs ?? this.remainingMs ?? 0;
    return ms <= 30_000;
  }
  isGameTied(): boolean { return this.homeScore === this.awayScore; }

  // -------- Controles que usa la plantilla --------
  toggle() {
    if (this.status === 'FINISHED' || this.status === 'CANCELLED') return;
    if (this.vmSnap.remainingMs <= 0) {
      this.vmSnap.remainingMs = this.vmSubject.value.quarterMs;
    }
    this.vmSnap.running = !this.vmSnap.running;
    this.vmSnap.running ? this.startTimer() : this.clearTimer();
  }

  resetQuarter() {
    this.vmSnap.running = false;
    this.clearTimer();
    this.vmSnap.remainingMs = this.vmSubject.value.quarterMs;
  }

  setDuration(evt: Event) {
    const minutes = Number((evt.target as HTMLSelectElement).value);
    const qms = Math.max(1, minutes) * 60 * 1000;
    this.vmSubject.next({ ...this.vmSubject.value, quarterMs: qms });
    if (!this.vmSnap.running) this.vmSnap.remainingMs = qms;
  }

  toggleAutoAdvance(evt: Event) {
    const checked = (evt.target as HTMLInputElement).checked;
    this.vmSubject.next({ ...this.vmSubject.value, autoAdvance: checked });
  }

  // -------- Temporizador interno simple (para que funcione) --------
  private startTimer() {
    this.clearTimer();
    let last = performance.now();
    this.timerId = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      this.vmSnap.remainingMs = Math.max(0, this.vmSnap.remainingMs - dt);
      if (this.vmSnap.remainingMs <= 0) {
        this.vmSnap.running = false;
        this.clearTimer();
        // Aquí podrías disparar auto-advance si vmSubject.value.autoAdvance === true
      }
    }, 100);
  }
  private clearTimer() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  }
}
