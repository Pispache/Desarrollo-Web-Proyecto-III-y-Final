import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, TeamDto } from '../services/api.service';

@Component({
  selector: 'app-players-team-select-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="container py-3">
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0 d-flex align-items-center gap-2">
        <i class="bi bi-people"></i>
        Elegir equipo para administrar jugadores
      </h4>
      <a class="btn btn-outline-secondary" [routerLink]="['/']">
        <i class="bi bi-arrow-left"></i> Volver
      </a>
    </div>

    <div class="card shadow-sm border-0">
      <div class="card-header">
        <div class="row g-2 align-items-end">
          <div class="col-12 col-md-6 col-xl-4">
            <label class="form-label mb-1">Buscar equipo</label>
            <input class="form-control form-control-sm" [(ngModel)]="q" placeholder="Nombre o ciudad" (ngModelChange)="reload()" />
          </div>
          <div class="col-6 col-md-3 col-xl-2">
            <label class="form-label mb-1">Página</label>
            <input type="number" class="form-control form-control-sm" [(ngModel)]="page" min="1" (change)="reload(true)" />
          </div>
          <div class="col-6 col-md-3 col-xl-2">
            <label class="form-label mb-1">Por página</label>
            <select class="form-select form-select-sm" [(ngModel)]="pageSize" (change)="reload(true)">
              <option [ngValue]="10">10</option>
              <option [ngValue]="20">20</option>
              <option [ngValue]="50">50</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style="width:90px">ID</th>
                <th>Equipo</th>
                <th>Ciudad</th>
                <th style="width:140px" class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of teams">
                <td class="text-muted">
                  <div class="row-cell">#{{ t.teamId }}</div>
                </td>
                <td>
                  <div class="row-cell d-flex align-items-center gap-2">
                    <img *ngIf="t.logoUrl as url" [src]="resolveLogo(url)" alt="logo" style="height:28px; width:28px; object-fit:contain;" class="rounded border">
                    <span class="fw-semibold">{{ t.name }}</span>
                  </div>
                </td>
                <td>
                  <div class="row-cell">{{ t.city || '—' }}</div>
                </td>
                <td class="text-end">
                  <div class="row-cell justify-content-end d-flex">
                    <button class="btn btn-sm btn-primary" (click)="goManage(t)">
                      <i class="bi bi-person-gear"></i> Administrar jugadores
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="teams.length === 0">
                <td colspan="4" class="text-center text-muted py-3">No hay equipos</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-3 small text-muted">
          <div>Total: {{ total }}</div>
          <div>Página {{ page }} de {{ maxPage || 1 }}</div>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [
    `:host .card, :host .card-body { color: #000 !important; }`,
    `:host h4, :host .form-label, :host span, :host small { color: #000 !important; }`,
    `:host input, :host select { background: #fff !important; color: #000 !important; }`,
    // Alineación vertical consistente en filas (sin flex en el <td>)
    `:host .row-cell { min-height: 44px; display: flex; align-items: center; }`
  ]
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
