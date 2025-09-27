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
  <div class="players-team-select-page py-3">
    <div class="container">
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
  </div>
  `,
  styles: [
    // Fondo de página y layout
    `.players-team-select-page{min-height:100vh;` +
      `background:radial-gradient(1200px 400px at 10% -10%,rgba(88,28,135,.35),rgba(88,28,135,0) 60%),`+
      `radial-gradient(1600px 600px at 90% -20%,rgba(37,99,235,.35),rgba(37,99,235,0) 60%),`+
      `linear-gradient(180deg,#0b1428 0%,#0f213c 60%,#0b1428 100%);}`,
    // Card y controles en oscuro (base)
    `.players-team-select-page .card{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);`+
      `border:1px solid rgba(255,255,255,.1);color:#fff;}`,
    `.players-team-select-page .card-header{background:rgba(0,0,0,.2);`+
      `border-bottom:1px solid rgba(255,255,255,.1);color:#fff;}`,
    `.players-team-select-page .form-label{color:#fff;font-weight:500;}`,
    `.players-team-select-page input,.players-team-select-page select{`+
      `background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;}`,
    `.players-team-select-page input::placeholder{color:rgba(255,255,255,.6);}`,
    `.players-team-select-page input:focus,.players-team-select-page select:focus{`+
      `background:rgba(255,255,255,.15);border-color:#f59e0b;box-shadow:0 0 0 .2rem rgba(245,158,11,.25);color:#fff;}`,
    `.players-team-select-page .table{color:#e5e7eb;}`,
    `.players-team-select-page .table thead th{color:#cbd5e1;border-bottom-color:rgba(255,255,255,.15);}`,
    `.players-team-select-page .table tbody td{border-top-color:rgba(255,255,255,.08);}`,
    // Light theme overrides
    `[data-theme="light"] .players-team-select-page{`+
      `background:radial-gradient(1200px 400px at 10% -10%,rgba(99,102,241,.12),rgba(99,102,241,0) 60%),`+
      `radial-gradient(1600px 600px at 90% -20%,rgba(59,130,246,.10),rgba(59,130,246,0) 60%),`+
      `linear-gradient(180deg,#f3f6fb 0%,#eef2f7 60%,#f3f6fb 100%);}`,
    `[data-theme="light"] .players-team-select-page .card{background:#fff;border:1px solid rgba(0,0,0,.125);color:#212529;}`,
    `[data-theme=\"light\"] .players-team-select-page .card-header{background:#f8f9fa;border-bottom:1px solid rgba(0,0,0,.1);color:#212529;}`,
    `[data-theme=\"light\"] .players-team-select-page .form-label{color:#212529;}`,
    `[data-theme=\"light\"] .players-team-select-page input,`+
    `[data-theme=\"light\"] .players-team-select-page select{background:#fff;border:1px solid rgba(0,0,0,.2);color:#212529;}`,
    `[data-theme=\"light\"] .players-team-select-page input::placeholder{color:rgba(0,0,0,.45);}`,
    `[data-theme=\"light\"] .players-team-select-page input:focus,`+
    `[data-theme=\"light\"] .players-team-select-page select:focus{background:#fff;border-color:#0d6efd;box-shadow:0 0 0 .2rem rgba(13,110,253,.25);color:#212529;}`,
    `[data-theme=\"light\"] .players-team-select-page .table{color:#1f2937;}`,
    `[data-theme=\"light\"] .players-team-select-page .table thead th{color:#111827;border-bottom-color:rgba(0,0,0,.12);}`,
    `[data-theme=\"light\"] .players-team-select-page .table tbody td{border-top-color:rgba(0,0,0,.06);}`,
    // Utilidad fila
    `.row-cell{min-height:44px;display:flex;align-items:center;}`
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
