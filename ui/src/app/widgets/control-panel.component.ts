import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Game, Player, FoulSummary } from '../services/api.service';
import { NotificationService } from '../services/notification.service';
import { SoundService } from '../services/sound.service';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-panel.component.html',
})
export class ControlPanelComponent implements OnChanges {
  @Input({ required: true }) game!: Game;

  /** NUEVO: para que [isSuspended] del HomePage no falle */
  @Input() isSuspended: boolean = false;

  @Output() changed = new EventEmitter<void>();

  homePlayers: Player[] = [];
  awayPlayers: Player[] = [];

  selHomePlayerId: number | null = null;
  selAwayPlayerId: number | null = null;

  teamFouls = { home: 0, away: 0 };

  constructor(
    private api: ApiService,
    private notify: NotificationService,
    private sound: SoundService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['game']?.currentValue) {
      this.loadPlayers();
      this.refreshFouls();
      this.sound.preloadAll();
    }
  }

  private refresh() { this.changed.emit(); }

  private loadPlayers() {
    if (!this.game) return;
    this.api.listGamePlayers(this.game.gameId, 'HOME').subscribe({
      next: (ps) => (this.homePlayers = ps),
      error: () => this.notify.showError('Error', 'No se pudieron cargar jugadores HOME', false)
    });
    this.api.listGamePlayers(this.game.gameId, 'AWAY').subscribe({
      next: (ps) => (this.awayPlayers = ps),
      error: () => this.notify.showError('Error', 'No se pudieron cargar jugadores AWAY', false)
    });
  }

  private refreshFouls() {
    if (!this.game) return;
    this.api.getFoulSummary(this.game.gameId).subscribe({
      next: (s: FoulSummary) => {
        const q = this.game.quarter;
        const th = s.team.find(r => r.quarter === q && r.team === 'HOME')?.fouls ?? 0;
        const ta = s.team.find(r => r.quarter === q && r.team === 'AWAY')?.fouls ?? 0;
        this.teamFouls = { home: th, away: ta };
      },
      error: () => this.notify.showError('Error', 'No se pudo cargar el resumen de faltas', false)
    });
  }

  /** Deshabilita anotación si no está en juego o si está suspendido */
  disabledScore() {
    return this.game?.status !== 'IN_PROGRESS' || this.isSuspended;
  }

  start() {
    this.api.start(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.notify.showSuccess('Partido iniciado', `Quarter ${this.game.quarter} en curso`, 2200);
        this.sound.play('start');
      },
      error: () => { this.notify.showError('Error', 'No se pudo iniciar el partido', true); this.sound.play('error'); }
    });
  }

  advance() {
    const prevQ = this.game.quarter;
    this.api.advance(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshFouls();
        this.notify.showInfo('Fin de cuarto', `Se avanzó de Q${prevQ} a Q${prevQ + 1}`, 2200);
        this.sound.play('quarter_end');
        this.notify.triggerQuarterEndFlash();
      },
      error: () => { this.notify.showError('Error', 'No se pudo avanzar de cuarto', true); this.sound.play('error'); }
    });
  }

  finish() {
    this.api.finish(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshFouls();
        this.notify.showSuccess('Partido finalizado', 'Se cerró el marcador', 2600);
        this.sound.play('game_end');
      },
      error: () => { this.notify.showError('Error', 'No se pudo finalizar el partido', true); this.sound.play('error'); }
    });
  }

  undo() {
    this.api.undo(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshFouls();
        this.notify.showInfo('Deshacer', 'Se revirtió la última acción', 1800);
        this.sound.play('undo');
      },
      error: () => { this.notify.showError('Error', 'No se pudo deshacer la última acción', true); this.sound.play('error'); }
    });
  }

  score(team:'HOME'|'AWAY', points:1|2|3) {
    if (this.disabledScore()) return;
    this.api.score(this.game.gameId, team, points).subscribe({
      next: () => {
        this.refresh();
        const teamTxt = team === 'HOME' ? 'HOME' : 'AWAY';
        this.notify.showSuccess('Anotación', `${teamTxt} sumó ${points} punto${points>1?'s':''}`, 1600);
        this.sound.play(points === 3 ? 'score3' : points === 2 ? 'score2' : 'score1');
        this.notify.triggerScoreGlow();
      },
      error: () => { this.notify.showError('Error', 'No se pudo registrar la anotación', false); this.sound.play('error'); }
    });
  }

  foul(team:'HOME'|'AWAY') {
    if (this.isSuspended) return;
    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    this.api.foul(this.game.gameId, team, { playerId: playerId ?? undefined }).subscribe({
      next: () => {
        this.refresh();
        this.refreshFouls();
        const teamTxt = team === 'HOME' ? 'HOME' : 'AWAY';
        this.notify.showWarning('Falta', `Falta marcada a favor de ${teamTxt}`, 2000);
        this.sound.play('foul');
        this.notify.triggerFoulShake();
      },
      error: () => { this.notify.showError('Error', 'No se pudo registrar la falta', false); this.sound.play('error'); }
    });
  }
}
