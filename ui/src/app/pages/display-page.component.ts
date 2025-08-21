import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { interval, Subscription, switchMap, merge, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { ApiService, GameDetail, GameStatus } from '../services/api.service';
import { ClockService } from '../services/clock.service';
import { ControlPanelComponent } from '../widgets/control-panel.component';

type GameEvent = GameDetail['events'][number];

@Component({
  selector: 'app-display-page',
  standalone: true,
  imports: [CommonModule, DatePipe, ControlPanelComponent],
  templateUrl: './display-page.component.html',
  styles: [`
    /* Estilos personalizados para la barra de desplazamiento */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #1f2937;
    }
    ::-webkit-scrollbar-thumb {
      background: #f59e0b;
      border-radius: 3px;
    }
  `]
})
export class DisplayPageComponent implements OnInit, OnDestroy {
  detail?: GameDetail;
  lastUpdated: Date = new Date();
  private gameId!: number;
  private sub?: Subscription;
  private clockSub?: Subscription;
  private currentTime: string = '10:00';
  
  // Propiedad para verificar si el juego está suspendido
  get isGameSuspended(): boolean {
    return this.detail?.game.status === 'SUSPENDED';
  }

  constructor(
    private route: ActivatedRoute, 
    private api: ApiService,
    private clock: ClockService
  ) {}

  ngOnInit(): void {
    this.gameId = Number(this.route.snapshot.paramMap.get('id'));
    
    // Suscribirse a los cambios del reloj
    if (this.gameId) {
      this.clockSub = this.clock.getState(this.gameId).subscribe({
        next: (state) => {
          if (state) {
            this.currentTime = this.formatTimeFromMs(state.remainingMs);
            
            // Verificar si el tiempo ha llegado a 0 y el reloj está corriendo
            if (state.remainingMs <= 0 && state.running) {
              this.handleTimerExpiration();
            }
          }
        },
        error: (err) => console.error('Error en el reloj:', err)
      });

      // Manejar evento de expiración del tiempo
      this.clock.expired.subscribe(() => {
        this.handleTimerExpiration();
      });
    }
    
    // Polling para el resto de datos del partido
    this.sub = interval(2000)
      .pipe(switchMap(() => this.api.getGame(this.gameId)))
      .subscribe({
        next: (d) => {
          this.detail = d;
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
        this.detail = game;
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

  // Manejar la expiración del temporizador
  private handleTimerExpiration(): void {
    if (this.detail?.game.status === 'IN_PROGRESS') {
      // Reproducir sonido de fin de cuarto
      this.playSound('quarter-end');
      
      // Avanzar automáticamente al siguiente cuarto después de un breve retraso
      setTimeout(() => {
        if (this.detail && this.detail.game.quarter < 4) {
          this.clock.advanceClock(this.gameId).subscribe({
            next: () => {
              console.log('Cuarto avanzado automáticamente');
              // Reproducir sonido de inicio de cuarto
              this.playSound('quarter-start');
            },
            error: (error: Error) => console.error('Error al avanzar el cuarto:', error)
          });
        } else if (this.detail && this.detail.game.quarter >= 4) {
          // Si es el cuarto 4, finalizar el partido
          this.clock.finishClock(this.gameId).subscribe({
            next: () => {
              console.log('Partido finalizado automáticamente');
              this.playSound('game-end');
            },
            error: (error: Error) => console.error('Error al finalizar el partido:', error)
          });
        }
      }, 2000); // Esperar 2 segundos antes de avanzar
    }
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
    return this.currentTime || '10:00';
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
    
    // Si hay una propiedad directa (puede no existir)
    const directProperty = team === 'home' ? 'homeTeamFouls' : 'awayTeamFouls';
    if (directProperty in this.detail.game) {
      return (this.detail.game as any)[directProperty] || 0;
    }
    
    // Si no, contar las faltas de los eventos
    return this.detail.events?.filter(e => 
      e.eventType === 'FOUL' && e.team === (team === 'home' ? 'HOME' : 'AWAY')
    ).length || 0;
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

  private getQuarterName(quarter: number): string {
    const quarters = ['primer', 'segundo', 'tercer', 'cuarto', 'primer tiempo extra', 'segundo tiempo extra'];
    return quarters[quarter - 1] || `cuarto ${quarter}`;
  }
}