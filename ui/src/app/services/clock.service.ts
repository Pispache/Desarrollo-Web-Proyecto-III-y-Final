import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable, Subject, merge, filter, interval, startWith,
  switchMap, shareReplay, map, tap, catchError, of
} from 'rxjs';

export interface ClockState {
  running: boolean;
  remainingMs: number;
  quarterMs: number;
}

// DTO del backend
interface ClockStateDto {
  gameId: number;
  quarter: number;
  quarterMs: number;
  running: boolean;
  remainingMs: number;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ClockService {
  // OJO: si tu proxy ya mapea /api -> backend, déjalo así.
  // Si NO usas proxy, usa la URL completa del backend (p. ej. 'http://localhost:5280/api').
  private base = '/api';

  /** Notifica que el clock de un gameId cambió (start/pause/reset en cualquier vista) */
  private clockChanged$ = new Subject<number>();

  constructor(private http: HttpClient) {}

  /** Estado del reloj:
   *  - polling cada 1s
   *  - refresco inmediato cuando clockChanged$ emite
   *  - tolerante a errores (no mata el stream)
   */
  state$(gameId: number): Observable<ClockState> {
    return merge(
      interval(1000).pipe(startWith(0)),
      this.clockChanged$.pipe(filter(id => id === gameId))
    ).pipe(
      switchMap(() =>
        this.http.get<ClockStateDto>(`${this.base}/games/${gameId}/clock`).pipe(
          map(dto => ({
            running: dto.running,
            remainingMs: dto.remainingMs,
            quarterMs: dto.quarterMs
          })),
          // Si falla el GET (404/red), mantenemos el stream vivo con un estado neutro
          catchError(() => of<ClockState>({ running: false, remainingMs: 0, quarterMs: 0 }))
        )
      ),
      shareReplay(1)
    );
  }

  /** Inicia/Reanuda en servidor y avisa a todas las vistas */
  start(gameId: number) {
    this.http.post(`${this.base}/games/${gameId}/clock/start`, {})
      .pipe(tap(() => this.clockChanged$.next(gameId)))
      .subscribe({ error: () => {/* opcional: toast/log */} });
  }

  /** Pausa en servidor y avisa a todas las vistas */
  pause(gameId: number) {
    this.http.post(`${this.base}/games/${gameId}/clock/pause`, {})
      .pipe(tap(() => this.clockChanged$.next(gameId)))
      .subscribe({ error: () => {/* opcional: toast/log */} });
  }

  /** Resetea en servidor (por defecto 12min) y avisa a todas las vistas */
  resetForNewQuarter(gameId: number, quarterMs = 12 * 60 * 1000) {
    this.http.post(`${this.base}/games/${gameId}/clock/reset`, { quarterMs })
      .pipe(tap(() => this.clockChanged$.next(gameId)))
      .subscribe({ error: () => {/* opcional: toast/log */} });
  }

  stop(gameId: number) { this.pause(gameId); }
}
