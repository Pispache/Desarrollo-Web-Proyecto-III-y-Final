import { Component, Input, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable } from 'rxjs';
import { MsToClockPipe } from '../pipes/ms-to-clock.pipe';

export type GameStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'SUSPENDED' | 'PAUSED' | 'CANCELLED';

interface ClockVM { quarterMs: number; autoAdvance: boolean; }
interface VmSnap { running: boolean; remainingMs: number; }

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, FormsModule, MsToClockPipe],
  templateUrl: './clock.component.html',
})
export class ClockComponent implements OnChanges, OnDestroy {
  // Inputs del template
  @Input() status?: GameStatus;
  @Input() quarter: number = 1;
  @Input() remainingMs: number = 0;
  @Input() gameId?: number | string;
  @Input() homeScore: number = 0;
  @Input() awayScore: number = 0;

  // Extras que tu template usa
  @Input() controls: boolean = true;
  @Input() showTeamFouls: boolean = false;
  @Input() teamFoulsHome: number = 0;
  @Input() teamFoulsAway: number = 0;
  @Input() bonusHome: boolean = false;
  @Input() bonusAway: boolean = false;

  /** Duraciones por regla */
  @Input() defaultQuarterMinutes = 10;
  @Input() overtimeMinutes = 5;

  private vmSubject = new BehaviorSubject<ClockVM>({
    quarterMs: 10 * 60 * 1000,
    autoAdvance: false,
  });
  vm$: Observable<ClockVM> = this.vmSubject.asObservable();

  vmSnap: VmSnap = { running: false, remainingMs: 0 };
  busy = false;
  private timerId: any = null;

  ngOnChanges(ch: SimpleChanges): void {
    // Sincroniza la duración cuando cambie el cuarto o el estado
    if ('quarter' in ch || 'status' in ch) {
      this.syncDurationWithQuarter();
    }
  }
  ngOnDestroy(): void { this.clearTimer(); }

  // ===== Helpers del template =====
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

  // ===== Controles del reloj (no hacen advance de cuarto por su cuenta) =====
  toggle() {
    if (this.status === 'FINISHED' || this.status === 'CANCELLED') return;
    if (this.vmSnap.remainingMs <= 0) this.vmSnap.remainingMs = this.vmSubject.value.quarterMs;
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

  // ===== Motor simple del timer =====
  private startTimer() {
    this.clearTimer();
    let last = performance.now();
    this.timerId = setInterval(() => {
      const now = performance.now();
      const dt = now - last; last = now;
      this.vmSnap.remainingMs = Math.max(0, this.vmSnap.remainingMs - dt);
      if (this.vmSnap.remainingMs <= 0) {
        this.vmSnap.running = false;
        this.clearTimer();
        // Importante: NO avanzamos de cuarto automáticamente aquí
        // (el avance lo hace tu API; así evitamos "sumar 2 cuartos")
      }
    }, 100);
  }
  private clearTimer() {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  }

  /** Ajusta quarterMs/remainingMs según si es OT o no (OT = 5:00) */
  private syncDurationWithQuarter() {
    const isOT = this.isOvertime();
    const wantedMs = (isOT ? this.overtimeMinutes : this.defaultQuarterMinutes) * 60 * 1000;

    // Si cambia de 4→5 (inicio OT) o hay desajuste, resetea a duración correcta
    if (this.vmSubject.value.quarterMs !== wantedMs || (isOT && this.vmSnap.remainingMs === 0)) {
      this.vmSubject.next({ ...this.vmSubject.value, quarterMs: wantedMs });
      this.vmSnap.remainingMs = wantedMs;
    }
  }
}
