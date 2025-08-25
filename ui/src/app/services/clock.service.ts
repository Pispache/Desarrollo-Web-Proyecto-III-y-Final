import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable, Subject, merge, filter, interval, startWith,
  switchMap, shareReplay, map, tap, catchError, of, BehaviorSubject, Subscription
} from 'rxjs';

export interface ClockState {
  running: boolean;
  remainingMs: number;
  quarterMs: number;
  quarter: number;
  gameStatus: 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED' | 'SUSPENDED';
  lastUpdated: Date;
  autoAdvance: boolean;
  homeScore: number;
  awayScore: number;
}

// DTO del backend
interface ClockStateDto {
  gameId: number;
  quarter: number;
  quarterMs: number;
  running: boolean;
  remainingMs: number;
  updatedAt: string;
  gameStatus: 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED' | 'SUSPENDED';
  autoAdvance: boolean;
  homeScore: number;
  awayScore: number;
}

@Injectable({ providedIn: 'root' })
export class ClockService implements OnDestroy {
  private base = '/api';
  private clockStates = new Map<number, BehaviorSubject<ClockState>>();
  private clockChanged$ = new Subject<number>();
  private expiredSubject = new Subject<number>();
  private subscriptions = new Subscription();
  private readonly POLLING_INTERVAL = 500; // 0.5s para reducir desfase visible
  private readonly AUTO_ADVANCE_DELAY = 2000; // 2 segundos de espera antes de avanzar automáticamente

  // Evento que se emite cuando el tiempo del cuarto actual termina
  readonly expired = this.expiredSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Obtiene el estado actual del reloj para un juego específico
   * @param gameId ID del juego
   * @returns Observable con el estado actual del reloj
   */
  getState(gameId: number): Observable<ClockState> {
    if (!this.clockStates.has(gameId)) {
      // Si no existe un estado para este juego, creamos uno inicial
      const initialState: ClockState = {
        running: false,
        remainingMs: 0,
        quarterMs: 10 * 60 * 1000, // 10 minutos por defecto
        quarter: 1,
        gameStatus: 'SCHEDULED',
        lastUpdated: new Date(),
        autoAdvance: false,
        homeScore: 0,
        awayScore: 0
      };
      this.clockStates.set(gameId, new BehaviorSubject<ClockState>(initialState));
      this.setupPolling(gameId);
    }
    return this.clockStates.get(gameId)!.asObservable();
  }

  /**
   * Limpia las subscripciones al destruir el servicio
   */
  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.clockStates.forEach(state => state.complete());
    this.clockStates.clear();
  }

  /**
   * Inicia un tiempo extra para el juego especificado
   * @param gameId ID del juego
   */
  startOvertime(gameId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/games/${gameId}/overtime`, {}).pipe(
      tap(() => {
        // Forzar una actualización del estado después de iniciar el tiempo extra
        this.clockChanged$.next(gameId);
      })
    );
  }

  /** Configura el polling para un juego específico */
  private setupPolling(gameId: number): void {
    const polling$ = merge(
      interval(this.POLLING_INTERVAL).pipe(startWith(0)),
      this.clockChanged$.pipe(filter(id => id === gameId))
    ).pipe(
      switchMap(() => this.fetchClockState(gameId)),
      catchError(error => {
        console.error('Error en el reloj:', error);
        return of(null);
      }),
      filter((state): state is Partial<ClockState> => state !== null)
    );

    this.subscriptions.add(
      polling$.subscribe(state => {
        const currentState = this.clockStates.get(gameId)?.value;
        if (!currentState) return;
        
        const newState: ClockState = {
          running: state.running ?? currentState.running,
          remainingMs: state.remainingMs ?? currentState.remainingMs,
          quarterMs: state.quarterMs ?? currentState.quarterMs,
          quarter: state.quarter ?? currentState.quarter,
          gameStatus: state.gameStatus ?? currentState.gameStatus,
          // IMPORTANT: al recibir estado del servidor, sincronizamos el reloj local
          // fijando lastUpdated al momento actual para evitar restar de más
          lastUpdated: new Date(),
          autoAdvance: state.autoAdvance ?? currentState.autoAdvance,
          homeScore: state.homeScore ?? currentState.homeScore,
          awayScore: state.awayScore ?? currentState.awayScore
        };
        
        this.clockStates.get(gameId)?.next(newState);

        // Manejar finalización del cuarto con avance automático
        if (state.remainingMs !== undefined && state.remainingMs <= 0 && 
            state.running && state.autoAdvance && state.quarter !== undefined) {
          this.handleQuarterEnd(gameId, state.quarter, state.gameStatus ?? 'IN_PROGRESS');
        }
      })
    );

    // Tiqueo local entre polls: decrementar remainingMs cuando running=true
    const ticker$ = interval(100);
    this.subscriptions.add(
      ticker$.subscribe(() => {
        const subject = this.clockStates.get(gameId);
        const current = subject?.value;
        if (!subject || !current || !current.running) return;
        const now = Date.now();
        const elapsed = now - current.lastUpdated.getTime();
        if (elapsed <= 0) return;
        const remaining = Math.max(0, current.remainingMs - elapsed);
        const updated: ClockState = {
          ...current,
          remainingMs: remaining,
          lastUpdated: new Date(now)
        };
        subject.next(updated);
        if (remaining <= 0) {
          // Notificar expiración local; el avance real lo maneja el componente/servidor
          this.expiredSubject.next(gameId);
        }
      })
    );
  }

  /** Obtiene el estado actual del reloj desde el servidor */
  private fetchClockState(gameId: number): Observable<Partial<ClockState>> {
    const sentAt = Date.now();
    return this.http.get<ClockStateDto>(`${this.base}/games/${gameId}/clock`).pipe(
      map(dto => {
        const receivedAt = Date.now();
        const rtt = Math.max(0, receivedAt - sentAt);
        // Compensación usando mitad del RTT, independiente del reloj del servidor
        const adjustedRemaining = Math.max(0, dto.remainingMs - Math.floor(rtt / 2));
        return {
          running: dto.running,
          remainingMs: adjustedRemaining,
          quarterMs: dto.quarterMs,
          quarter: dto.quarter,
          gameStatus: dto.gameStatus,
          lastUpdated: new Date(receivedAt),
          autoAdvance: dto.autoAdvance ?? false,
          homeScore: dto.homeScore ?? 0,
          awayScore: dto.awayScore ?? 0
        } as Partial<ClockState>;
      }),
      catchError(() => of({}))
    );
  }

  /** Maneja el final de un cuarto con avance automático */
  private handleQuarterEnd(gameId: number, quarter: number, gameStatus: string): void {
    const currentState = this.clockStates.get(gameId)?.value;
    if (!currentState) return;
    
    // Pausar el reloj si está corriendo
    this.pause(gameId);
    
    // Verificar si el avance automático está habilitado
    if (currentState.autoAdvance && gameStatus === 'IN_PROGRESS') {
      if (quarter < 4) {
        // Avanzar al siguiente cuarto después de un breve retraso
        setTimeout(() => {
          this.advanceClock(gameId).subscribe({
            error: (error) => this.handleError('Error al avanzar automáticamente de cuarto:', error)
          });
        }, this.AUTO_ADVANCE_DELAY);
      } else if (quarter >= 4) {
        // Si es el último cuarto, finalizar el partido
        this.finishGame(gameId);
      }
    }
  }

  private finishGame(gameId: number): void {
    this.http.post(`${this.base}/games/${gameId}/finish`, {}).subscribe({
      next: () => {
        // Actualizar el estado local
        const currentState = this.clockStates.get(gameId)?.value;
        if (currentState) {
          this.clockStates.get(gameId)?.next({
            ...currentState,
            gameStatus: 'FINISHED',
            running: false
          });
        }
      },
      error: (err) => console.error('Error finalizando partido:', err)
    });
  }

  // === Métodos de control del reloj ===

  start(gameId: number): void {
    // Optimista: reflejar de inmediato que corre
    const subject = this.clockStates.get(gameId);
    const now = Date.now();
    if (subject) {
      const cur = subject.value;
      subject.next({
        ...cur,
        running: true,
        lastUpdated: new Date(now)
      });
    }
    // Notificar a los observadores inmediatamente
    this.clockChanged$.next(gameId);
    // Llamada real al backend
    this.executeClockAction(gameId, 'start');
  }

  pause(gameId: number): void {
    // Optimista: congelar el tiempo restante y marcar no corriendo
    const subject = this.clockStates.get(gameId);
    const now = Date.now();
    if (subject) {
      const cur = subject.value;
      const elapsed = Math.max(0, now - cur.lastUpdated.getTime());
      const remaining = cur.running ? Math.max(0, cur.remainingMs - elapsed) : cur.remainingMs;
      subject.next({
        ...cur,
        running: false,
        remainingMs: remaining,
        lastUpdated: new Date(now)
      });
    }
    this.clockChanged$.next(gameId);
    this.executeClockAction(gameId, 'pause');
  }

  reset(gameId: number, quarterMs?: number): void {
    const body = quarterMs ? { quarterMs } : {};
    // Optimista: aplicar valores localmente
    const subject = this.clockStates.get(gameId);
    const now = Date.now();
    if (subject) {
      const cur = subject.value;
      const newQuarterMs = quarterMs ?? cur.quarterMs;
      subject.next({
        ...cur,
        running: false,
        quarterMs: newQuarterMs,
        remainingMs: newQuarterMs,
        lastUpdated: new Date(now)
      });
    }
    this.clockChanged$.next(gameId);
    this.http.post(`${this.base}/games/${gameId}/clock/reset`, body)
      .pipe(tap(() => this.clockChanged$.next(gameId)))
      .subscribe({
        error: (error) => this.handleError('Error al reiniciar el reloj:', error)
      });
  }

  setDuration(gameId: number, minutes: number): void {
    const quarterMs = minutes * 60 * 1000; // Convertir minutos a milisegundos
    
    // Actualizar el estado local inmediatamente
    const currentState = this.clockStates.get(gameId)?.value;
    if (currentState) {
      // No actualizamos el estado local aquí, solo en la respuesta del servidor
      // para evitar parpadeos y mantener la consistencia
    }
    
    // Actualizar en el backend
    this.http.post<ClockStateDto>(`${this.base}/games/${gameId}/clock/duration`, { minutes })
      .pipe(
        map(dto => ({
          running: dto.running,
          remainingMs: dto.remainingMs,
          quarterMs: dto.quarterMs,
          quarter: dto.quarter,
          gameStatus: dto.gameStatus,
          lastUpdated: new Date(dto.updatedAt),
          autoAdvance: dto.autoAdvance ?? false
        })),
        tap(updatedState => {
          // Actualizar el estado local con la respuesta del servidor
          this.updateState(gameId, updatedState);
          this.clockChanged$.next(gameId);
        })
      )
      .subscribe({
        error: (error) => this.handleError('Error al establecer la duración:', error)
      });
  }

  toggleAutoAdvance(gameId: number, enabled: boolean): void {
    this.http.post(`${this.base}/games/${gameId}/clock/auto-advance`, { enabled })
      .pipe(tap(() => this.clockChanged$.next(gameId)))
      .subscribe({
        next: () => {},
        error: (error) => this.handleError('Error al cambiar el avance automático:', error)
      });
  }

  // Avanzar al siguiente cuarto
  advanceClock(gameId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/games/${gameId}/advance`, {}).pipe(
      tap(() => this.refreshClock(gameId))
    );
  }

  // Finalizar el partido
  finishClock(gameId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/games/${gameId}/finish`, {}).pipe(
      tap(() => this.refreshClock(gameId))
    );
  }

  // === Métodos de utilidad ===

  private executeClockAction(gameId: number, action: 'start' | 'pause' | 'stop'): void {
    this.http.post(`${this.base}/games/${gameId}/clock/${action}`, {})
      .pipe(tap(() => this.clockChanged$.next(gameId)))
      .subscribe({
        error: (error) => this.handleError(`Error al ${action} el reloj:`, error)
      });
  }

  private updateState(gameId: number, changes: Partial<ClockState>): void {
    const currentState = this.clockStates.get(gameId)?.value;
    if (currentState) {
      this.clockStates.get(gameId)?.next({ ...currentState, ...changes });
    }
  }

  private handleError(message: string, error: any): void {
    console.error(message, error);
    // Aquí podrías implementar notificaciones al usuario
  }

  // Refrescar el estado del reloj desde el servidor
  public refreshClock(gameId: number): void {
    this.fetchClockState(gameId).subscribe(state => {
      if (state) {
        this.updateState(gameId, state);
      }
    });
  }
}
