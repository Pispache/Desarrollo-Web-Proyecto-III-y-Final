import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Game } from '../services/api.service';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-panel.component.html',
})
export class ControlPanelComponent implements OnChanges {
  @Input({ required: true }) game!: Game;
  @Output() changed = new EventEmitter<void>();

  // Listas de jugadores del partido (lado HOME/AWAY)
  homePlayers: any[] = [];
  awayPlayers: any[] = [];

  // Selección actual para registrar falta por jugador
  selHomePlayerId?: number;
  selAwayPlayerId?: number;

  // Conteo de faltas del cuarto actual
  teamFouls = { home: 0, away: 0 };

  constructor(private api: ApiService) {}

  ngOnChanges(ch: SimpleChanges) {
    if (!this.game) return;
    // cargar jugadores del partido por lado
    this.api.listGamePlayers(this.game.gameId, 'HOME').subscribe(p => (this.homePlayers = p));
    this.api.listGamePlayers(this.game.gameId, 'AWAY').subscribe(p => (this.awayPlayers = p));
    // actualizar contadores de faltas por cuarto
    this.refreshFouls();
  }

  private refresh() { this.changed.emit(); }

  private refreshFouls() {
    if (!this.game) return;
    this.api.getFoulSummary(this.game.gameId).subscribe(s => {
      const q = this.game.quarter;
      const th = s.team.find(r => r.quarter === q && r.team === 'HOME')?.fouls ?? 0;
      const ta = s.team.find(r => r.quarter === q && r.team === 'AWAY')?.fouls ?? 0;
      this.teamFouls = { home: th, away: ta };
    });
  }

  disabledScore() { return this.game?.status !== 'IN_PROGRESS'; }

  start()   { this.api.start(this.game.gameId).subscribe(() => this.refresh()); }
  advance() { this.api.advance(this.game.gameId).subscribe(() => { this.refresh(); this.refreshFouls(); }); }
  finish()  { this.api.finish(this.game.gameId).subscribe(() => { this.refresh(); this.refreshFouls(); }); }
  undo()    { this.api.undo(this.game.gameId).subscribe(() => { this.refresh(); this.refreshFouls(); }); }

  score(team:'HOME'|'AWAY', points:1|2|3) {
    this.api.score(this.game.gameId, team, points).subscribe(() => this.refresh());
  }

  foul(team:'HOME'|'AWAY') {
    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    this.api.foul(this.game.gameId, team, { playerId }).subscribe(() => { this.refresh(); this.refreshFouls(); });
  }
}