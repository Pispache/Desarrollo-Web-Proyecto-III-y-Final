import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { interval, Subscription, switchMap, merge, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { ApiService, GameDetail } from '../services/api.service';
import { ClockService } from '../services/clock.service';

type GameEvent = GameDetail['events'][number];

@Component({
  selector: 'app-display-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
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
          }
        },
        error: (err) => console.error('Error en el reloj:', err)
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

  // Formatea el tiempo de juego mostrado en la pantalla
  formatGameTime(): string {
    return this.currentTime;
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
}