import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService, Game, GameStatus } from '../services/api.service';

@Component({
  selector: 'app-scoreboards-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './scoreboards-page.component.html',
  styleUrls: ['./scoreboards-page.component.scss']
})
export class ScoreboardsPageComponent implements OnInit {
  games: Game[] = [];
  status: GameStatus | 'ALL' = 'ALL';
  q = '';
  loading = false;
  // Paginación
  page = 1;
  pageSize = 10;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.load();
  }

  get maxPage(): number {
    const total = this.filtered.length || 0;
    return Math.max(1, Math.ceil(total / (this.pageSize || 1)));
  }

  get paged(): Game[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  goPage(p: number) {
    const m = this.maxPage;
    this.page = Math.min(m, Math.max(1, p));
  }

  changePageSize(sz: number) {
    this.pageSize = Math.max(1, sz|0);
    this.page = 1;
  }

  load() {
    this.loading = true;
    this.api.listGames().subscribe({
      next: (rows) => {
        this.games = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  get filtered(): Game[] {
    const s = this.status;
    const q = this.q.trim().toLowerCase();
    const filtered = this.games.filter(g => {
      const okS = s === 'ALL' ? true : g.status === s;
      const okQ = !q ? true : (`${g.homeTeam} ${g.awayTeam}`.toLowerCase().includes(q));
      return okS && okQ;
    });
    // Orden: En juego primero, luego por fecha desc
    return filtered.sort((a, b) => {
      const aLive = a.status === 'IN_PROGRESS' ? 1 : 0;
      const bLive = b.status === 'IN_PROGRESS' ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  statusLabel(s: GameStatus): string {
    const map: Record<GameStatus, string> = {
      SCHEDULED: 'Programado',
      IN_PROGRESS: 'En juego',
      FINISHED: 'Finalizado',
      CANCELLED: 'Cancelado',
      SUSPENDED: 'Suspendido'
    };
    return map[s] || s;
  }
}
