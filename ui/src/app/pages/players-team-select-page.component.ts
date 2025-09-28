/// <summary>
/// Página para elegir un equipo y administrar sus jugadores.
/// </summary>
/// <remarks>
/// - Permite buscar equipos por nombre o ciudad.
/// - Incluye paginación y tamaño de página configurable.
/// - Al seleccionar un equipo, navega a la gestión de jugadores.
/// </remarks>
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, TeamDto } from '../services/api.service';

@Component({
  selector: 'app-players-team-select-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  styleUrls: ['./players-team-select-page.component.scss'],
  templateUrl: './players-team-select-page.component.html',
})
export class PlayersTeamSelectPageComponent implements OnInit {
  q = '';
  page = 1;
  pageSize = 20;
  total = 0;
  teams: TeamDto[] = [];

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.reload();
  }

  get maxPage() { return Math.ceil((this.total || 0) / (this.pageSize || 1)); }

  reload(resetPage = false) {
    if (resetPage) this.page = 1;
    this.api.listTeamsPaged({ q: this.q?.trim() || undefined, page: this.page, pageSize: this.pageSize, sort: 'name' })
      .subscribe(p => {
        this.teams = p.items;
        this.total = p.total;
      });
  }

  resolveLogo(url?: string | null): string | null {
    if (!url) return null;
    const u = url.trim();
    if (!u) return null;
    if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
    const prefix = (location.port === '4200') ? `${location.protocol}//${location.hostname}:8080` : '';
    const sep = u.startsWith('/') ? '' : '/';
    return `${prefix}${sep}${u}`;
  }

  goManage(t: TeamDto) {
    try { localStorage.setItem('last.teamId', String(t.teamId)); } catch {}
    this.router.navigate(['/jugadores', t.teamId]);
  }
}
