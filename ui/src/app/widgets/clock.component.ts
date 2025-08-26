import { Component, Input, OnChanges, SimpleChanges, OnDestroy, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { ClockService } from '../services/clock.service';
import { MsToClockPipe } from '../pipes/ms-to-clock.pipe';
import { SoundService } from '../services/sound.service';

export type GameStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'SUSPENDED' | 'PAUSED' | 'CANCELLED';

interface ClockVM { quarterMs: number; autoAdvance: boolean; }
interface VmSnap { running: boolean; remainingMs: number; }

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, FormsModule, MsToClockPipe],
  templateUrl: './clock.component.html',
  styleUrls: ['./clock.component.scss']
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
  @Output() autoAdvanceChange = new EventEmitter<boolean>();
  
  private _autoAdvance = false;
  @Input()
  get autoAdvance(): boolean { return this._autoAdvance; }
  set autoAdvance(val: boolean) {
    this._autoAdvance = !!val;
    this.vmSubject.next({ 
      ...this.vmSubject.value, 
      autoAdvance: this._autoAdvance 
    });
    try { 
      localStorage.setItem('clock.autoAdvance', this._autoAdvance ? '1' : '0'); 
    } catch (e) {
      console.warn('No se pudo guardar la preferencia de avance automático:', e);
    }
  }
  @Output() advanceQuarter = new EventEmitter<void>();
  @Output() resetGame = new EventEmitter<void>();

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
  private serviceSub?: Subscription;
  private useServiceClock = false;
  // Guarda la duración elegida por el usuario para cuartos reglamentarios (no OT)
  private userQuarterMs: number | null = null;
  private prevRemainingMs = 0;
  private firedAtZero = false;

  constructor(private sound: SoundService, private clockSvc: ClockService) {}

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
        this._autoAdvance = auto;
        this.vmSubject.next({ ...this.vmSubject.value, autoAdvance: auto });
        this.autoAdvanceChange.emit(auto);
      }
    } catch (e) {
      // Ignorar errores de acceso a storage
      console.warn('No se pudo cargar preferencia de duración:', e);
    }

    // Si tenemos gameId, usar el reloj del servicio como fuente de verdad
    const id = this.gameId != null ? Number(this.gameId) : NaN;
    if (!Number.isNaN(id)) {
      this.useServiceClock = true;
      // Cancelar cualquier temporizador local
      this.clearTimer();
      // Suscribirse al estado compartido
      this.serviceSub = this.clockSvc.getState(id).subscribe(state => {
        // Refleja duración (desde backend) y snapshot del reloj
        this.vmSubject.next({
          ...this.vmSubject.value,
          quarterMs: state.quarterMs
        });
        this.vmSnap = {
          running: state.running,
          remainingMs: Math.max(0, state.remainingMs || 0)
        };

        // === AUTO-ADVANCE en modo servicio ===
        const was = this.prevRemainingMs;
        const now = this.vmSnap.remainingMs;

        // Reinicia la guarda cuando el tiempo vuelve a correr
        if (now > 0) this.firedAtZero = false;

        // Si venimos de >0 a 0 y está habilitado, emite
        if (
          this.autoAdvance &&
          this.status === 'IN_PROGRESS' &&
          !this.isOvertime() &&
          was > 0 &&
          now === 0 &&
          !this.firedAtZero
        ) {
          this.firedAtZero = true;
          // pequeño delay para evitar carreras con el backend
          setTimeout(() => this.advanceQuarter.emit(), 150);
        }

        this.prevRemainingMs = now;
      });
    }
  }

  ngOnChanges(ch: SimpleChanges): void {
    // Sincroniza la duración cuando cambie el cuarto o el estado
    if ('quarter' in ch || 'status' in ch) {
      this.syncDurationWithQuarter();
    }
  }
  ngOnDestroy(): void {
    this.clearTimer();
    this.serviceSub?.unsubscribe();
  }

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
    // En modo servicio, no usamos temporizador local
    if (!this.useServiceClock) {
      this.vmSnap.running ? this.startTimer() : this.clearTimer();
    }

    // Propagar al backend para que el Display se sincronice
    const id = this.gameId != null ? Number(this.gameId) : NaN;
    if (!Number.isNaN(id)) {
      try {
        if (this.vmSnap.running) {
          this.clockSvc.start(id);
        } else {
          this.clockSvc.pause(id);
        }
      } catch (e) {
        console.warn('No se pudo sincronizar start/pause con backend:', e);
      }
    }
  }

  resetQuarter() {
    this.vmSnap.running = false;
    this.firedAtZero = false;
    this.clearTimer();
    this.vmSnap.remainingMs = this.vmSubject.value.quarterMs;
    this.sound.play('buzzer_long');

    // Propagar reset al backend con la duración actual para que el Display se sincronice
    const id = this.gameId != null ? Number(this.gameId) : NaN;
    if (!Number.isNaN(id)) {
      try {
        this.clockSvc.reset(id, this.vmSubject.value.quarterMs);
      } catch (e) {
        console.warn('No se pudo sincronizar reset con backend:', e);
      }
    }
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

    // Si hay gameId, propagar la duración al backend para sincronizar Display
    const id = this.gameId != null ? Number(this.gameId) : NaN;
    if (!Number.isNaN(id)) {
      try {
        // Si es múltiplo exacto de minuto, usar endpoint de minutos; si no, usar reset con ms
        if (qms % 60000 === 0) {
          const minutes = Math.max(1, Math.floor(qms / 60000));
          this.clockSvc.setDuration(id, minutes);
        } else {
          this.clockSvc.reset(id, qms);
        }
      } catch (e) {
        console.warn('No se pudo enviar nueva duración al backend:', e);
      }
    }
  }

  // Manejar cambio en el switch de avance automático
  onAutoAdvanceChange(isChecked: boolean) {
    // Solo actualizar si el valor cambió
    if (this._autoAdvance !== isChecked) {
      this.autoAdvance = isChecked; // Actualiza el estado local y el VM
      this.autoAdvanceChange.emit(isChecked); // Notifica al padre
      
      // Actualizar en el servicio si es necesario
      if (this.useServiceClock && this.gameId != null) {
        const id = Number(this.gameId);
        if (!isNaN(id)) {
          // this.clockSvc.setAutoAdvance(id, isChecked).subscribe();
        }
      }
      
      // Si se activó el auto-advance y el tiempo ya terminó, avanzar al siguiente cuarto
      if (isChecked && this.vmSnap.remainingMs <= 0 && !this.isOvertime()) {
        this.advanceQuarter.emit();
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
        if (this.autoAdvance && !this.isOvertime()) {
          this.firedAtZero = true; // evita duplicar si luego llega un tick del servicio
          this.advanceQuarter.emit();
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
    // Si usamos el reloj del servicio, no tocar duraciones ni remainingMs aquí
    if (this.useServiceClock) return;
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
