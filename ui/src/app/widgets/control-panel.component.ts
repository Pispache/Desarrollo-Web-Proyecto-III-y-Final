import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Game, FoulType, Player } from '../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-panel.component.html',
})
export class ControlPanelComponent implements OnChanges {
  @Input({ required: true }) game!: Game;
  @Output() changed = new EventEmitter<void>();

  homePlayers: Player[] = [];
  awayPlayers: Player[] = [];

  selHomePlayerId?: number;
  selAwayPlayerId?: number;

  selHomeFoulType: FoulType = 'PERSONAL';
  selAwayFoulType: FoulType = 'PERSONAL';

  teamFouls = { home: 0, away: 0 };

  breakdown: {
    home: Record<FoulType, number>,
    away: Record<FoulType, number>
  } = {
    home: { PERSONAL: 0, TECHNICAL: 0, UNSPORTSMANLIKE: 0, DISQUALIFYING: 0 },
    away: { PERSONAL: 0, TECHNICAL: 0, UNSPORTSMANLIKE: 0, DISQUALIFYING: 0 },
  };

  private readonly FOUL_TYPES: readonly FoulType[] =
    ['PERSONAL','TECHNICAL','UNSPORTSMANLIKE','DISQUALIFYING'] as const;

  constructor(private api: ApiService) {}

  get isInProgress() { return this.game?.status === 'IN_PROGRESS'; }

  ngOnChanges(_: SimpleChanges) {
    if (!this.game) return;

    // Reset selecciones al cambiar de partido
    this.selHomePlayerId = undefined;
    this.selAwayPlayerId = undefined;
    this.selHomeFoulType = 'PERSONAL';
    this.selAwayFoulType = 'PERSONAL';

    // Cargar plantillas en paralelo
    forkJoin({
      home: this.api.listGamePlayers(this.game.gameId, 'HOME'),
      away: this.api.listGamePlayers(this.game.gameId, 'AWAY'),
    }).subscribe(({ home, away }) => {
      this.homePlayers = home;
      this.awayPlayers = away;
    });

    this.refreshAll();
  }

  private refresh() { this.changed.emit(); }

  private refreshAll() {
    this.refreshFouls();
    this.refreshFoulsByType();
  }

  private refreshFouls() {
    if (!this.game) return;
    this.api.getFoulSummary(this.game.gameId).subscribe(s => {
      const q = this.game.quarter;
      const th = s.team.find(r => r.quarter === q && r.team === 'HOME')?.fouls ?? 0;
      const ta = s.team.find(r => r.quarter === q && r.team === 'AWAY')?.fouls ?? 0;
      this.teamFouls = { home: th, away: ta };
    });
  }

  // Desglose por tipo usando los eventos del juego (cuarto actual)
  private refreshFoulsByType() {
    if (!this.game) return;
    const zero = (): Record<FoulType, number> =>
      ({ PERSONAL: 0, TECHNICAL: 0, UNSPORTSMANLIKE: 0, DISQUALIFYING: 0 });

    this.api.getGame(this.game.gameId).subscribe(detail => {
      const q = this.game.quarter;
      const home = zero(), away = zero();

      for (const e of detail.events ?? []) {
        if (e.eventType !== 'FOUL' || e.quarter !== q) continue;
        const t = this.FOUL_TYPES.includes(e.foulType as FoulType)
          ? (e.foulType as FoulType)
          : 'PERSONAL';
        (e.team === 'HOME' ? home : away)[t] += 1;
      }

      this.breakdown = { home, away };
    });
  }

  start()   { this.api.start(this.game.gameId).subscribe(() => this.refresh()); }
  advance() { this.api.advance(this.game.gameId).subscribe(() => { this.refresh(); this.refreshAll(); }); }
  finish()  { this.api.finish(this.game.gameId).subscribe(() => { this.refresh(); this.refreshAll(); }); }
  undo()    { this.api.undo(this.game.gameId).subscribe(() => { this.refresh(); this.refreshAll(); }); }

  score(team:'HOME'|'AWAY', points:1|2|3) {
    if (!this.isInProgress) return;
    this.api.score(this.game.gameId, team, points).subscribe(() => this.refresh());
  }

  foul(team:'HOME'|'AWAY') {
    if (this.game?.status !== 'IN_PROGRESS') return;
    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    const type     = team === 'HOME' ? this.selHomeFoulType : this.selAwayFoulType;

    this.api.foul(this.game.gameId, team, { playerId, type }).subscribe({
      next: () => { this.refresh(); this.refreshFouls(); this.refreshFoulsByType(); },
      error: () => {
        // Fallback: registra sin tipo para no bloquear el flujo
        this.api.foul(this.game.gameId, team, { playerId }).subscribe({
          next: () => { this.refresh(); this.refreshFouls(); this.refreshFoulsByType(); },
          error: (e2) => {
            console.error('No se pudo registrar la falta:', e2);
            alert(e2?.error?.error || 'No se pudo registrar la falta.');
          }
        });
      }
    });
  }

}
