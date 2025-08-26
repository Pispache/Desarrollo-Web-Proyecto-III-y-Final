import { Component, OnDestroy, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { interval, Subscription, switchMap, merge, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { ApiService, GameDetail, GameStatus } from '../services/api.service';
import { ClockService, ClockState } from '../services/clock.service';
import { ControlPanelComponent } from '../widgets/control-panel.component';

type GameEvent = GameDetail['events'][number];

@Component({
  selector: 'app-display-page',
  standalone: true,
  imports: [CommonModule, ControlPanelComponent],
  templateUrl: './display-page.component.html',
  styleUrls: ['./display-page.component.scss']
})
export class DisplayPageComponent implements OnInit, OnDestroy {
  detail?: GameDetail;
  lastUpdated: Date = new Date();
  isAdmin: boolean = false; // Cambiar a true para habilitar el panel de control
  
  private gameId!: number;
  private sub?: Subscription;
  private clockSub?: Subscription;
  private clockState: ClockState | null = null;
  private prevRemainingMs = 0;
  private firedAtZero = false;
  private advancing = false; // evita dobles llamados al API
  
  // Propiedad para verificar si el juego está suspendido
  get isGameSuspended(): boolean {
    return this.detail?.game.status === 'SUSPENDED';
  }

  // Verifica si el tiempo restante es bajo (menos de 1 minuto)
  isTimeLow(): boolean {
    if (this.clockState) {
      return this.clockState.remainingMs < 60_000;
    }
    if (this.detail?.game.timeRemaining !== undefined) {
      return this.detail.game.timeRemaining < 60_000;
    }
    return false;
  }

  // Obtiene el nombre del cuarto actual
  getQuarterName(quarter: number): string {
    if (!quarter) return '1er CUARTO';
    switch (quarter) {
      case 1: return '1er CUARTO';
      case 2: return '2do CUARTO';
      case 3: return '3er CUARTO';
      case 4: return '4to CUARTO';
      default: return `PRÓRROGA ${quarter - 4}`;
    }
  }

  constructor(
    private route: ActivatedRoute, 
    private api: ApiService,
    private clock: ClockService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  // Métodos para el panel de control
  onScore(event: { team: 'HOME' | 'AWAY', points: 1 | 2 | 3, playerId?: number, playerNumber?: number }): void {
    if (!this.detail) return;
    
    this.api.score(this.gameId, event.team, event.points, {
      playerId: event.playerId,
      playerNumber: event.playerNumber
    }).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al registrar puntos:', err)
    });
  }

  onFoul(event: { team: 'HOME' | 'AWAY', playerId?: number, playerNumber?: number, type?: string }): void {
    if (!this.detail) return;
    
    this.api.foul(this.gameId, event.team, {
      playerId: event.playerId,
      playerNumber: event.playerNumber,
      type: event.type as any
    }).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al registrar falta:', err)
    });
  }

  onTimeout(event: { team: 'HOME' | 'AWAY' }): void {
    // Implementar lógica de tiempo muerto si es necesario
    console.log(`Tiempo muerto solicitado por el equipo: ${event.team}`);
  }

  onUndo(): void {
    if (!this.detail) return;
    
    this.api.undo(this.gameId).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al deshacer la última acción:', err)
    });
  }

  onAdvance(): void {
    if (!this.detail) return;
    
    this.api.advance(this.gameId).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al avanzar de cuarto:', err)
    });
  }

  onFinish(): void {
    if (!this.detail) return;
    
    if (confirm('¿Estás seguro de que deseas finalizar el partido?')) {
      this.api.finish(this.gameId).subscribe({
        next: () => this.refreshGame(),
        error: (err) => console.error('Error al finalizar el partido:', err)
      });
    }
  }

  onSuspend(): void {
    if (!this.detail) return;
    
    this.api.suspendGame(this.gameId).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al suspender el partido:', err)
    });
  }

  onResume(): void {
    if (!this.detail) return;
    
    this.api.resumeGame(this.gameId).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al reanudar el partido:', err)
    });
  }

  onReset(): void {
    if (!this.detail) return;
    
    if (confirm('¿Estás seguro de que deseas reiniciar el partido? Se perderán todos los datos.')) {
      this.api.resetGame(this.gameId).subscribe({
        next: () => this.refreshGame(),
        error: (err) => console.error('Error al reiniciar el partido:', err)
      });
    }
  }

  onAdjustScore(event: { home: number, away: number }): void {
    if (!this.detail) return;
    
    this.api.adjustScore(this.gameId, event.home, event.away).subscribe({
      next: () => this.refreshGame(),
      error: (err) => console.error('Error al ajustar el marcador:', err)
    });
  }

  ngOnInit(): void {
    this.gameId = Number(this.route.snapshot.paramMap.get('id'));
    
    // Suscribirse a los cambios del reloj
    if (this.gameId) {
      this.clockSub = this.clock.getState(this.gameId).subscribe({
        next: (state) => {
          if (!state) return;

          // Actualizar dentro de la zona de Angular y solicitar render
          this.zone.run(() => {
            this.clockState = state; // actualiza el reloj de la ui
            this.cdr.markForCheck();
          });

          const was = this.prevRemainingMs;
          const now = Math.max(0, state.remainingMs || 0);

          // Reinicia la guarda cuando vuelve a haber tiempo (>0)
          if (now > 0) this.firedAtZero = false;

          // DISPARA SIN EXIGIR running=true
          if (was > 0 && now === 0 && !this.firedAtZero) {
            this.firedAtZero = true;
            this.handleTimerExpiration();  // avance/fin
          }

          this.prevRemainingMs = now;
        },
        error: (err) => console.error('Error en el reloj:', err)
      });
    }
    
    // Polling para el resto de datos del partido
    this.sub = interval(2000)
      .pipe(switchMap(() => this.api.getGame(this.gameId)))
      .subscribe({
        next: (d) => {
          this.detail = d;  //ACTUALIZA datos en la UI
          this.lastUpdated = new Date();
        },
        error: (err) => console.error('Error al cargar el partido:', err)
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.clockSub?.unsubscribe();
  }
  
  // Método para refrescar los datos del juego
  refreshGame(): void {
    if (!this.gameId) return;
    
    this.api.getGame(this.gameId).subscribe({
      next: (game) => {
        this.detail = game; //actualiza UI
        this.lastUpdated = new Date();
      },
      error: (err) => console.error('Error al actualizar el juego:', err)
    });
  }
  
  // Método llamado cuando se solicita un reinicio
  onResetRequested(): void {
    if (!this.gameId) return;
    
    // Mostrar mensaje de confirmación
    if (!confirm('¿Estás seguro de que deseas reiniciar TODO el partido? Se reiniciará el marcador, faltas y el tiempo.')) {
      return;
    }
    
    // Llamar al endpoint de reinicio
    this.api.resetAll(this.gameId).subscribe({
      next: () => {
        // Éxito: recargar datos después de un breve retraso
        setTimeout(() => {
          this.refreshGame();
          if (this.clock) {
            this.clock.refreshClock(this.gameId);
          }
        }, 500);
      },
      error: (err) => {
        console.error('Error al reiniciar el partido:', err);
        alert(`Error al reiniciar el partido: ${err?.error?.detail || err.message || 'Error desconocido'}`);
      }
    });
  }

  // Helpers para manejar avance y finalización con delay
  private advanceAfter(ms: number, log: string) {
    if (this.advancing) return;
    this.advancing = true;
    setTimeout(() => {
      this.clock.advanceClock(this.gameId).subscribe({
        next: () => { 
          console.log(log); 
          this.playSound('quarter-start'); 
          this.refreshGame(); 
        },
        error: err => console.error('Error al avanzar', err),
        complete: () => (this.advancing = false),
      });
    }, ms);
  }

  private finishAfter(ms: number) {
    if (this.advancing) return;
    this.advancing = true;
    setTimeout(() => {
      this.clock.finishClock(this.gameId).subscribe({
        next: () => { 
          console.log('Partido finalizado automáticamente'); 
          this.playSound('game-end'); 
          this.refreshGame(); 
        },
        error: err => console.error('Error al finalizar', err),
        complete: () => (this.advancing = false),
      });
    }, ms);
  }

  // Manejar la expiración del temporizador
  private handleTimerExpiration(): void {
    const g = this.detail?.game;
    if (!g || g.status !== 'IN_PROGRESS' || this.advancing) return;

    // Asegura datos frescos (por si la última canasta llegó pegada al 0:00)
    this.refreshGame();
    
    setTimeout(() => {
      const game = this.detail?.game;
      if (!game) return;

      const tied = game.homeScore === game.awayScore;

      // Reproducir sonido de fin de cuarto
      this.playSound('quarter-end');

      // Q1–Q3: siempre avanzar
      if (game.quarter < 4) {
        this.advanceAfter(500, `Fin de Q${game.quarter} → Q${game.quarter + 1}`);
        return;
      }

      // Q4: si empate → T.E. (Q5); si no → finalizar
      if (game.quarter === 4) {
        if (tied) {
          this.advanceAfter(500, 'Fin del 4º • Iniciando T.E.');
        } else {
          this.finishAfter(500);
        }
        return;
      }

      // T.E. (Q5+): si empate → otro T.E.; si no → finalizar
      if (tied) {
        console.log('Empate en tiempo extra, avanzando a nuevo T.E.');
        this.advanceAfter(500, `Fin de T.E. • Nuevo T.E. (Q${game.quarter + 1})`);
      } else {
        console.log('No hay empate en tiempo extra, finalizando partido');
        this.finishAfter(500);
      }
    }, 150); // Pequeño delay para asegurar que los datos están actualizados
  }

  // Reproducir sonidos
  private playSound(type: 'quarter-end' | 'quarter-start' | 'game-end'): void {
    try {
      let soundFile = '';
      switch (type) {
        case 'quarter-end':
          soundFile = 'quarter-end.mp3';
          break;
        case 'quarter-start':
          soundFile = 'quarter-start.mp3';
          break;
        case 'game-end':
          soundFile = 'game-end.mp3';
          break;
      }
      
      const audio = new Audio(`/assets/sounds/${soundFile}`);
      audio.play().catch(e => console.warn(`No se pudo reproducir el sonido ${type}:`, e));
    } catch (error) {
      console.warn('Error al reproducir sonido:', error);
    }
  }

  getGameStatus(status: string): string {
    const statusMap: {[key: string]: string} = {
      'SCHEDULED': 'PROGRAMADO',
      'IN_PROGRESS': 'EN JUEGO',
      'PAUSED': 'PAUSADO',
      'FINISHED': 'FINALIZADO',
      'CANCELLED': 'CANCELADO',
      'SUSPENDED': 'SUSPENDIDO'
    };
    return statusMap[status] || status;
  }

  // Formatea el tiempo de juego mostrado en la pantalla
  formatGameTime(): string {
    // Usar directamente el tiempo del reloj del servicio
    if (this.clockState) {
      return this.formatTimeFromMs(this.clockState.remainingMs);
    }
    
    // Si no hay estado del reloj, usar el valor del juego como respaldo
    if (this.detail?.game?.timeRemaining !== undefined) {
      return this.formatTimeFromMs(this.detail.game.timeRemaining);
    }
    
    return '10:00'; // Valor por defecto
  }

  // Formatea milisegundos a MM:SS
  private formatTimeFromMs(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Obtiene el número de faltas para un equipo de manera segura
  getTeamFouls(team: 'home' | 'away'): number {
    if (!this.detail) return 0;
    
    // Si ya tenemos las faltas en el objeto del juego, las usamos
    if (team === 'home' && this.detail.game.homeFouls !== undefined) {
      return this.detail.game.homeFouls;
    } else if (team === 'away' && this.detail.game.awayFouls !== undefined) {
      return this.detail.game.awayFouls;
    }
    
    // Si no, calculamos a partir de los eventos
    return this.detail.events
      .filter(event => event.team === team.toUpperCase() && event.eventType === 'FOUL')
      .length;
  }

  // Determina el mensaje del ganador o empate
  getWinner(game: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }): string {
    if (game.homeScore > game.awayScore) {
      return `¡${game.homeTeam} GANA EL PARTIDO!`;
    } else if (game.awayScore > game.homeScore) {
      return `¡${game.awayTeam} GANA EL PARTIDO!`;
    } else {
      return '¡EMPATE!';
    }
  }

  getEventDescription(event: GameEvent): string {
    if (!event) return '';
    
    const pointsMap: {[key: string]: number} = {
      'POINT_1': 1,
      'POINT_2': 2,
      'POINT_3': 3
    };
    
    const points = pointsMap[event.eventType];
    if (points !== undefined) {
      return `${event.team} anotó ${points} punto${points > 1 ? 's' : ''}${event.playerNumber ? ` (#${event.playerNumber})` : ''}`;
    }
    
    if (event.eventType === 'FOUL') {
      return `Falta de ${event.team}${event.playerNumber ? ` (#${event.playerNumber})` : ''}${event.foulType ? ` (${event.foulType})` : ''}`;
    }
    
    if (event.eventType === 'UNDO') {
      return `Se deshizo la última acción`;
    }
    
    return event.eventType;
  }

}