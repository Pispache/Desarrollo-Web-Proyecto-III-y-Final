import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiService, Game, GameDetail, Player, FoulSummary } from '../services/api.service';

// Pipes reutilizables para mantener el HTML limpio (se usarán en el .html)
import { TeamFoulsPipe, PlayerFoulsTotalPipe, IsBonusPipe } from './ui.pipes';

@Component({
  selector: 'app-results-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TeamFoulsPipe,
    PlayerFoulsTotalPipe,
    IsBonusPipe,
  ],
  templateUrl: './results-page.component.html',
})
export class ResultsPageComponent {
  // filtros
  q = '';
  statusFilter: 'ALL' | 'FINISHED' | 'IN_PROGRESS' | 'SCHEDULED' = 'FINISHED';

  // datos
  games: Game[] = [];
  filtered: Game[] = [];
  selected: GameDetail | null = null;
  homeRoster: Player[] = [];
  awayRoster: Player[] = [];
  foulSummary: FoulSummary | null = null;

  constructor(private api: ApiService) {
    this.reload();
  }

  // ===== Listado y filtros =====
  reload() {
    this.api.listGames().subscribe((g) => {
      this.games = g;
      this.applyFilters();
    });
  }

  applyFilters() {
    const q = this.q.trim().toLowerCase();
    this.filtered = this.games.filter((x) => {
      const okS = this.statusFilter === 'ALL' || x.status === this.statusFilter;
      const txt = `${x.homeTeam} ${x.awayTeam}`.toLowerCase();
      const okQ = !q || txt.includes(q);
      return okS && okQ;
    });
  }

  // ===== Detalle =====
  view(g: Game) {
    forkJoin({
      detail: this.api.getGame(g.gameId),
      home: this.api.listGamePlayers(g.gameId, 'HOME'),
      away: this.api.listGamePlayers(g.gameId, 'AWAY'),
      summary: this.api.getFoulSummary(g.gameId),
    }).subscribe(({ detail, home, away, summary }) => {
      // eventos recientes primero (por si el backend no viene ordenado)
      detail.events = [...detail.events].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
      this.selected = detail;
      this.homeRoster = home;
      this.awayRoster = away;
      this.foulSummary = summary;
    });
  }
}
