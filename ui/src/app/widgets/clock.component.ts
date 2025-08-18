import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, Pipe, PipeTransform } from '@angular/core';
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
      <div class="flex gap-2 justify-center">
        <button class="border rounded px-3 py-1" (click)="toggle()" [disabled]="!gameId || status==='FINISHED'">
          {{ vmSnap?.running ? 'Pausar' : 'Iniciar' }}
        </button>
        <button class="border rounded px-3 py-1" (click)="resetQuarter()" [disabled]="!gameId">Reiniciar cuarto</button>
      </div>
    </div>
  `
})
export class ClockComponent implements OnChanges {
  @Input() gameId?: number;
  @Input() status?: 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';
  @Input() quarter?: number;
  @Output() expired = new EventEmitter<void>();

  vm$?: Observable<ClockState>;
  vmSnap?: ClockState;

  constructor(private clock: ClockService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.gameId) return;

    if (!this.vm$) {
      this.vm$ = this.clock.state$(this.gameId).pipe(
        map(s => { this.vmSnap = s; if (s.remainingMs === 0) this.expired.emit(); return s; })
      );
    }
    if (ch['status']) {
      if (this.status === 'IN_PROGRESS') this.clock.start(this.gameId);
      else this.clock.pause(this.gameId);
    }
    if (ch['quarter'] && !ch['quarter'].firstChange) {
      this.clock.resetForNewQuarter(this.gameId);
      if (this.status === 'IN_PROGRESS') this.clock.start(this.gameId);
    }
  }

  toggle() {
    if (!this.gameId) return;
    this.vmSnap?.running ? this.clock.pause(this.gameId) : this.clock.start(this.gameId);
  }

  resetQuarter() {
    if (!this.gameId) return;
    this.clock.resetForNewQuarter(this.gameId);
  }
}
