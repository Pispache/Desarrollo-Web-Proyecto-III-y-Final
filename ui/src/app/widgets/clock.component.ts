import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, map } from 'rxjs';
import { ClockService, ClockState } from '../services/clock.service';
import { interval, Subscription } from 'rxjs';
import { ApiService, FoulSummary } from '../services/api.service';

@Pipe({ name: 'msToClock', standalone: true })
export class MsToClockPipe implements PipeTransform {
  transform(ms?: number): string {
    if (ms == null) return '--:--';
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, MsToClockPipe],
  templateUrl: './clock.component.html',
})
export class ClockComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) gameId!: number;
  @Input() status?: 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';
  @Input() quarter?: number;
  @Input() showTeamFouls = true; 
  /** Mostrar/ocultar botones (en público: [controls]="false") */
  @Input() controls = true;

  @Output() expired = new EventEmitter<void>();

  vm$?: Observable<ClockState>;
  vmSnap?: ClockState;
  teamFoulsHome = 0;
  teamFoulsAway = 0;
  bonusHome = false;
  bonusAway = false;

  private prevRemaining = -1; // guarda estado previo para detectar llegada a 0
  private prevRunning = false;
  busy = false;
  private foulsSub?: Subscription; 

  constructor(private clock: ClockService, private api: ApiService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.gameId) return;

    // 1) (Re)crear stream cuando cambia gameId
    if (!this.vm$ || (ch['gameId'] && !ch['gameId'].firstChange && ch['gameId'].previousValue !== ch['gameId'].currentValue)) {
      this.prevRemaining = -1;
      this.prevRunning = false;
      this.vm$ = this.clock.state$(this.gameId).pipe(
        map(s => {
          if (this.prevRunning && this.prevRemaining > 0 && s.remainingMs === 0) this.expired.emit();
          this.vmSnap = s;
          this.prevRunning = !!s.running;
          this.prevRemaining = s.remainingMs;
          return s;
        })
      );
    }

    // 2) Si cambia el status, asegura start/pause del servicio
    if (ch['status'] && !ch['status'].firstChange && ch['status'].previousValue !== ch['status'].currentValue) {
      if (this.status === 'IN_PROGRESS') this.clock.start(this.gameId);
      else this.clock.pause(this.gameId);
    }

    // 3) Si cambia el quarter realmente, reinicia duración desde backend
    if (ch['quarter'] && !ch['quarter'].firstChange && ch['quarter'].previousValue !== ch['quarter'].currentValue) {
      this.clock.resetForNewQuarter(this.gameId);
      if (this.status === 'IN_PROGRESS') this.clock.start(this.gameId);
    }
      if (ch['gameId'] || ch['status'] || ch['quarter']) {
      this.startFoulsPolling();
      }
  }

  ngOnDestroy(): void {
    this.foulsSub?.unsubscribe();
  }

  toggle() {
    if (this.busy || !this.gameId || this.status === 'FINISHED') return;
    this.busy = true;
    this.vmSnap?.running ? this.clock.pause(this.gameId) : this.clock.start(this.gameId);
    setTimeout(() => (this.busy = false), 150);
  }

  resetQuarter() {
    if (this.busy || !this.gameId) return;
    this.busy = true;
    this.clock.resetForNewQuarter(this.gameId);
    setTimeout(() => (this.busy = false), 150);
  }
  // +++ AÑADIR: inicia/renueva el polling de faltas
private startFoulsPolling() {
  this.foulsSub?.unsubscribe();

  // si no hay juego o el partido terminó, solo hace un refresh y no sigue
  if (!this.gameId) return;

  // refresco inmediato
  this.refreshFouls();

  // Si está en progreso, actualiza cada 2s; si no, no gasta polling
  if (this.status === 'IN_PROGRESS') {
    this.foulsSub = interval(2000).subscribe(() => this.refreshFouls());
  }
}

  // +++ AÑADIR: consulta el summary y calcula conteos/bonus del cuarto actual
  private refreshFouls() {
    if (!this.gameId) return;
    const curQ = this.quarter ?? 1;

    this.api.getFoulSummary(this.gameId).subscribe({
      next: (s: FoulSummary) => {
        const sumOf = (team: 'HOME'|'AWAY') =>
          (s.team ?? [])
            .filter(r => (r.team?.toString().toUpperCase() === team) && r.quarter === curQ)
            .reduce((a, r) => a + (r.fouls ?? 0), 0);

        this.teamFoulsHome = sumOf('HOME');
        this.teamFoulsAway = sumOf('AWAY');

        // Regla FIBA: bonus a partir de la 5ª falta del período
        this.bonusHome = this.teamFoulsHome >= 5;
        this.bonusAway = this.teamFoulsAway >= 5;
      },
      
      error: () => {
        // no romper UI en caso de error/transitorio
        this.teamFoulsHome = 0;
        this.teamFoulsAway = 0;
        this.bonusHome = this.bonusAway = false;
      }
    });
  }

}
