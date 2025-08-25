import { Component, Input, Output, EventEmitter, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Game, GameDetail } from '../services/api.service';
import { FormsModule } from '@angular/forms';

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
export class ScoreboardComponent {
  @Input({ required: true }) game!: Game;
  @Input() events: GameDetail['events'] = [];
  @Input() isAdmin = false;
  
  @Output() adjustScore = new EventEmitter<{homeDelta: number, awayDelta: number}>();
  
  @ViewChild('adjustModalRef') adjustModalRef?: ElementRef<HTMLDivElement>;
  @ViewChild('modalHost') modalHost?: ElementRef<HTMLDivElement>;

  showAdjustModal = false;
  adjustForm = {
    homeDelta: 0,
    awayDelta: 0
  };
  
  showEvents = false;
  
  openAdjustModal() {
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
}
