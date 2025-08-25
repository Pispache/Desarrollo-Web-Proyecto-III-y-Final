import { Component, Input, OnChanges, SimpleChanges, OnDestroy, Output, EventEmitter, OnInit } from '@angular/core';
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
export class ClockComponent implements OnChanges, OnDestroy, OnInit {
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
  @Input() autoAdvance: boolean = false;
  @Output() advanceQuarter = new EventEmitter<void>();

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
  // Guarda la duración elegida por el usuario para cuartos reglamentarios (no OT)
  private userQuarterMs: number | null = null;

  ngOnInit(): void {
    // Cargar preferencia desde localStorage si existe
    try {
      const raw = localStorage.getItem('clock.userQuarterMs');
      if (raw) {
        const val = Number(raw);
        if (!Number.isNaN(val) && val >= 1000) {
          this.userQuarterMs = val;
          // Aplicar al estado actual si no es tiempo extra
          if (!this.isOvertime()) {
            this.vmSubject.next({ ...this.vmSubject.value, quarterMs: val });
            if (!this.vmSnap.running) this.vmSnap.remainingMs = val;
          }
        }
      }
      // Cargar preferencia de avance automático
      const rawAuto = localStorage.getItem('clock.autoAdvance');
      if (rawAuto !== null) {
        const auto = rawAuto === '1' || rawAuto === 'true';
        this.vmSubject.next({ ...this.vmSubject.value, autoAdvance: auto });
      }
    } catch (e) {
      // Ignorar errores de acceso a storage
      console.warn('No se pudo cargar preferencia de duración:', e);
    }
  }

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
    // Ahora el <select> entrega milisegundos directamente (e.g., 20000, 300000, 600000)
    const ms = Number((evt.target as HTMLSelectElement).value);
    const qms = Math.max(1000, ms); // mínimo 1s por seguridad
    this.userQuarterMs = qms; // recordar preferencia del usuario
    this.vmSubject.next({ ...this.vmSubject.value, quarterMs: qms });
    if (!this.vmSnap.running) this.vmSnap.remainingMs = qms;
    // Persistir en localStorage
    try { localStorage.setItem('clock.userQuarterMs', String(qms)); } catch {}
  }

  async toggleAutoAdvance(evt: Event) {
    const checked = (evt.target as HTMLInputElement).checked;
    // Update local state
    const newValue = { ...this.vmSubject.value, autoAdvance: checked };
    this.vmSubject.next(newValue);
    // Persistir preferencia
    try { localStorage.setItem('clock.autoAdvance', checked ? '1' : '0'); } catch {}
    
    // If we have a gameId, save the preference
    if (this.gameId) {
      try {
        // You might want to save this preference to your backend
        // For now, we'll just log it
        console.log('Auto-advance setting changed:', checked);
      } catch (error) {
        console.error('Error saving auto-advance preference:', error);
      }
    }
  }

  // ===== Motor simple del timer =====
  private startTimer() {
    this.clearTimer();
    
    // If remaining time is 0, set it to the full quarter duration
    if (this.vmSnap.remainingMs <= 0) {
      this.vmSnap.remainingMs = this.vmSubject.value.quarterMs;
    }
    
    const startTime = performance.now();
    const targetTime = startTime + this.vmSnap.remainingMs;
    
    const update = () => {
      const now = performance.now();
      this.vmSnap.remainingMs = Math.max(0, targetTime - now);
      
      if (this.vmSnap.remainingMs <= 0) {
        // Stop and pause
        this.vmSnap.running = false;
        this.clearTimer();

        // If auto-advance is enabled and no OT, notify parent to advance quarter.
        // Do not restart the timer here; after the parent advances the quarter,
        // ngOnChanges -> syncDurationWithQuarter() will set the full duration and remain paused.
        if (this.vmSubject.value.autoAdvance && !this.isOvertime()) {
          setTimeout(() => this.advanceQuarter.emit(), 300);
        }
      } else {
        // Schedule next update
        this.timerId = setTimeout(() => requestAnimationFrame(update), 50);
      }
    };
    
    // Start the update loop
    this.timerId = setTimeout(() => requestAnimationFrame(update), 50);
  }
  private clearTimer() {
    if (this.timerId) { 
      clearTimeout(this.timerId); 
      this.timerId = null; 
    }
  }

  /** Ajusta quarterMs/remainingMs según si es OT o no (OT = 5:00) */
  private syncDurationWithQuarter() {
    const isOT = this.isOvertime();
    // En OT usamos duración fija de prórroga; en tiempo reglamentario respetamos
    // la selección del usuario si existe, si no, usamos el valor actual/default
    const newDuration = isOT
      ? this.overtimeMinutes * 60 * 1000
      : (this.userQuarterMs ?? this.vmSubject.value.quarterMs ?? this.defaultQuarterMinutes * 60 * 1000);
    
    // Actualiza la duración del cuarto
    this.vmSubject.next({
      ...this.vmSubject.value,
      quarterMs: newDuration
    });
    
    // Si no está corriendo o si el tiempo restante es 0, establece el tiempo inicial
    if (!this.vmSnap.running || this.vmSnap.remainingMs === 0) {
      this.vmSnap = { 
        ...this.vmSnap, 
        remainingMs: newDuration 
      };
    }
  }
}
