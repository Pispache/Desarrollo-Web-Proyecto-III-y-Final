import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClockService, ClockState } from '../services/clock.service';
import { Observable, map } from 'rxjs';

/** Pipe: milisegundos -> mm:ss */
@Pipe({ name: 'msToClock', standalone: true })
export class MsToClockPipe implements PipeTransform {
  transform(ms?: number): string {
    if (ms == null) return '--:--';
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60).toString().padStart(2,'0');
    const s = (total % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }
}

@Component({
  selector: 'app-clock',
  standalone: true,
  imports: [CommonModule, MsToClockPipe],
  template: `
    <div class="p-3 border rounded grid gap-2">
      <div class="text-sm text-gray-600">Cronómetro (por cuarto)</div>
      <div class="text-4xl font-bold text-center" [class.text-red-600]="(vm$ | async)?.remainingMs===0">
        {{ (vm$ | async)?.remainingMs | msToClock }}
      </div>

      <div class="flex gap-2 justify-center" *ngIf="controls">
        <button class="border rounded px-3 py-1"
                (click)="toggle()"
                [disabled]="busy || !gameId || status==='FINISHED'">
          {{ vmSnap?.running ? 'Pausar' : 'Iniciar' }}
        </button>
        <button class="border rounded px-3 py-1"
                (click)="resetQuarter()"
                [disabled]="busy || !gameId">
          Reiniciar cuarto
        </button>
      </div>
    </div>
  `
})
export class ClockComponent implements OnChanges, OnDestroy {
  @Input() gameId?: number;
  @Input() status?: 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';
  @Input() quarter?: number;
  /** Mostrar/ocultar botones (en público: [controls]="false") */
  @Input() controls = true;

  @Output() expired = new EventEmitter<void>();

  vm$?: Observable<ClockState>;
  vmSnap?: ClockState;

  // guards para emitir expired solo si estaba corriendo y pasó de >0 a 0
  private prevRemaining = -1;
  private prevRunning = false;

  busy = false;

  constructor(private clock: ClockService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.gameId) return;

    // Inicializa stream si aún no existe (o si cambia el gameId)
    if (!this.vm$ || (ch['gameId'] && !ch['gameId'].firstChange && ch['gameId'].previousValue !== ch['gameId'].currentValue)) {
      this.prevRemaining = -1;
      this.prevRunning = false;

      this.vm$ = this.clock.state$(this.gameId).pipe(
        map(s => {
          if (this.prevRunning && this.prevRemaining > 0 && s.remainingMs === 0) {
            this.expired.emit();
          }
          this.vmSnap = s;
          this.prevRunning = !!s.running;
          this.prevRemaining = s.remainingMs;
          return s;
        })
      );
    }

    // (Opcional) Reaccionar a cambios reales de status
    if (ch['status'] && !ch['status'].firstChange &&
        ch['status'].previousValue !== ch['status'].currentValue) {
      if (this.status === 'IN_PROGRESS') this.clock.start(this.gameId!);
      else this.clock.pause(this.gameId!);
    }

    // (Opcional) Solo si el quarter realmente cambió
    if (ch['quarter'] && !ch['quarter'].firstChange &&
        ch['quarter'].previousValue !== ch['quarter'].currentValue) {
      this.clock.resetForNewQuarter(this.gameId!); // respeta duración del backend
      if (this.status === 'IN_PROGRESS') this.clock.start(this.gameId!);
    }
  }

  ngOnDestroy(): void {
    // sin subs manuales; el async pipe gestiona
  }

  toggle() {
    if (!this.gameId || this.busy) return;
    this.busy = true;
    this.vmSnap?.running ? this.clock.pause(this.gameId) : this.clock.start(this.gameId);
    setTimeout(() => this.busy = false, 150);
  }

  resetQuarter() {
    if (!this.gameId || this.busy) return;
    this.busy = true;
    this.clock.resetForNewQuarter(this.gameId); // no pasamos quarterMs -> respeta BD
    setTimeout(() => this.busy = false, 150);
  }
}
