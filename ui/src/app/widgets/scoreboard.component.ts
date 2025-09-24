import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, OnInit, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Game, GameDetail } from '../services/api.service';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../services/notification.service';
import { ClockService } from '../services/clock.service';
import { Subscription } from 'rxjs';

interface AdjustScoreDto {
  homeDelta: number;
  awayDelta: number;
}

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scoreboard.component.html',
  styleUrls: ['./scoreboard.component.scss']
})
export class ScoreboardComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) game!: Game;
  @Input() events: GameDetail['events'] = [];
  @Input() isAdmin = false;
  @Input() homeLogoUrl?: string | null;
  @Input() awayLogoUrl?: string | null;
  clockRunning = false;
  private clockSub?: Subscription;
  
  @Output() adjustScore = new EventEmitter<{homeDelta: number, awayDelta: number}>();
  
  @ViewChild('adjustModalRef') adjustModalRef?: ElementRef<HTMLDivElement>;
  @ViewChild('modalHost') modalHost?: ElementRef<HTMLDivElement>;

  showAdjustModal = false;
  adjustForm = {
    homeDelta: 0,
    awayDelta: 0
  };
  
  showEvents = false;

  constructor(private notify: NotificationService, private clock: ClockService) {}

  ngOnInit(): void {
    this.bindClock();
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['game']) this.bindClock();
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
  }

  private bindClock() {
    this.clockSub?.unsubscribe();
    const id = this.game?.gameId;
    if (!id) { this.clockRunning = false; return; }
    this.clockSub = this.clock.getState(id).subscribe(s => {
      this.clockRunning = !!s.running;
    });
  }
  
  openAdjustModal() {
    // No permitir abrir si el reloj no está corriendo
    if (!this.clockRunning) {
      this.notify.showWarning('No disponible', 'Inicia el reloj para ajustar la puntuación.', 2000);
      return;
    }
    this.adjustForm = { homeDelta: 0, awayDelta: 0 };
    this.showAdjustModal = true;
    // Mover el modal al body para evitar clipping por contenedores padres
    setTimeout(() => {
      const el = this.adjustModalRef?.nativeElement;
      if (el && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    });
  }
  
  onAdjustScore() {
    this.adjustScore.emit({
      homeDelta: this.adjustForm.homeDelta,
      awayDelta: this.adjustForm.awayDelta
    });
    this.showAdjustModal = false;
    // eliminar modal del body si quedó anexado
    const el = this.adjustModalRef?.nativeElement;
    if (el && el.parentNode === document.body) {
      document.body.removeChild(el);
    }
  }

  // Método para cancelar el ajuste de puntuación
  cancelAdjust() {
    this.showAdjustModal = false;
    const el = this.adjustModalRef?.nativeElement;
    if (el && el.parentNode === document.body) {
      document.body.removeChild(el);
    }
  }

  // Método para guardar los cambios del ajuste de puntuación
  saveAdjust() {
    const newHome = this.game.homeScore + (this.adjustForm.homeDelta || 0);
    const newAway = this.game.awayScore + (this.adjustForm.awayDelta || 0);
    if (newHome < 0 || newAway < 0) {
      this.notify.showWarning('Datos inválidos', 'El puntaje no puede ser negativo.', 2000);
      return;
    }
    if (this.adjustForm.homeDelta !== 0 || this.adjustForm.awayDelta !== 0) {
      this.adjustScore.emit({
        homeDelta: this.adjustForm.homeDelta,
        awayDelta: this.adjustForm.awayDelta
      });
    }
    this.showAdjustModal = false;
  }

  // Determina el mensaje del ganador o empate
  getWinner(): string {
    if (this.game.homeScore > this.game.awayScore) {
      return `¡${this.game.homeTeam} GANA!`;
    } else if (this.game.awayScore > this.game.homeScore) {
      return `¡${this.game.awayTeam} GANA!`;
    } else {
      return '¡EMPATE!';
    }
  }

  toggleEvents() {
    this.showEvents = !this.showEvents;
  }

  /**
   * Devuelve una etiqueta legible para el tipo de evento.
   * Mapea ajustes manuales de puntuación a "CONFIGURACIÓN PERSONALIZADA".
   */
  getEventLabel(e: GameDetail['events'][number]): string {
    if (!e) return '';
    const t = String(e.eventType || '').toUpperCase();
    // Posibles etiquetas que el backend podría usar para ajuste manual
    const adjustAliases = new Set([
      'ADJUST_SCORE', 'SCORE_ADJUST', 'ADJUST', 'MANUAL_SCORE', 'MANUAL_ADJUST', 'CUSTOM_CONFIG', 'CUSTOM', 'CONFIG'
    ]);
    if (adjustAliases.has(t)) {
      const side = String((e as any).team || '').toUpperCase();
      const teamTxt = side === 'AWAY' ? 'AWAY' : 'HOME';
      return `AJUSTE DE PUNTUACIÓN (${teamTxt})`;
    }

    if (t === 'UNDO') return 'DESHACER';
    if (t === 'FOUL') return 'FALTA';

    // Puntos: POINT_1/2/3 → "PUNTO(S)"
    const m = /^POINT_(\d+)$/.exec(t);
    if (m) {
      const n = Number(m[1] || '0');
      return n > 1 ? `PUNTOS_${n}` : `PUNTO_${n}`;
    }

    // Fallback: devolver el tipo tal cual
    return e.eventType;
  }
}
