import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Game, GameDetail, Player, FoulSummary } from '../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-results-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="p-4 max-w-5xl mx-auto grid gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">Resultados</h1>
        <div class="flex gap-2">
          <button class="border rounded px-2 py-1" (click)="reload()">Actualizar</button>
          <a class="border rounded px-2 py-1 bg-gray-100" routerLink="/">Volver</a>
        </div>
      </div>

      <!-- Filtros -->
      <div class="border rounded p-3 grid gap-2">
        <div class="flex flex-wrap gap-2 items-center">
          <label class="text-sm">Estado:</label>
          <select [(ngModel)]="statusFilter" (change)="applyFilters()" class="border rounded px-2 py-1">
            <option value="FINISHED">Finalizados</option>
            <option value="ALL">Todos</option>
            <option value="IN_PROGRESS">En progreso</option>
            <option value="SCHEDULED">Programados</option>
          </select>

          <label class="text-sm ml-3">Buscar equipo:</label>
          <input [(ngModel)]="q" (input)="applyFilters()" placeholder="nombre contiene…" class="border rounded px-2 py-1" />
        </div>
      </div>

      <!-- Tabla de partidos -->
      <div class="border rounded p-3">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th class="text-left border-b py-1 pr-2">ID</th>
              <th class="text-left border-b py-1 pr-2">Equipos</th>
              <th class="text-left border-b py-1 pr-2">Marcador</th>
              <th class="text-left border-b py-1 pr-2">Estado</th>
              <th class="text-left border-b py-1 pr-2">Cuarto</th>
              <th class="text-left border-b py-1 pr-2">Fecha</th>
              <th class="text-left border-b py-1 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let g of games">
              <td class="py-1 pr-2">{{ g.gameId }}</td>
              <td class="py-1 pr-2">{{ g.homeTeam }} vs {{ g.awayTeam }}</td>
              <td class="py-1 pr-2">{{ g.homeScore }} - {{ g.awayScore }}</td>
              <td class="py-1 pr-2">{{ g.status }}</td>
              <td class="py-1 pr-2">{{ g.quarter }}</td>
              <td class="py-1 pr-2">{{ g.createdAt | date:'short' }}</td>
              <td class="py-1 pr-2 whitespace-nowrap">
                <button class="border rounded px-2 py-0.5" (click)="view(g)">Ver detalle</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div *ngIf="games.length===0" class="text-sm text-gray-600 mt-2">Sin resultados para el filtro.</div>
      </div>

      <!-- Detalle del partido seleccionado -->
      <div *ngIf="selected as d" class="border rounded p-3 grid gap-3">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">Detalle: #{{ d.game.gameId }}</h2>
          <a class="border rounded px-2 py-1 bg-gray-100" [href]="'/display/' + d.game.gameId" target="_blank" rel="noopener">Vista pública</a>
        </div>

        <div class="grid sm:grid-cols-2 gap-2 text-sm">
          <div><span class="font-medium">Equipos:</span> {{ d.game.homeTeam }} vs {{ d.game.awayTeam }}</div>
          <div><span class="font-medium">Estado:</span> {{ d.game.status }}</div>
          <div><span class="font-medium">Cuarto:</span> {{ d.game.quarter }}</div>
          <div><span class="font-medium">Fecha:</span> {{ d.game.createdAt | date:'short' }}</div>
          <div><span class="font-medium">Marcador:</span> {{ d.game.homeScore }} - {{ d.game.awayScore }}</div>
        </div>

        <!-- Eventos -->
        <div class="mt-1">
          <div class="font-medium mb-1">Eventos (recientes primero)</div>
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th class="text-left border-b py-1 pr-2">#</th>
                <th class="text-left border-b py-1 pr-2">Tipo</th>
                <th class="text-left border-b py-1 pr-2">Equipo</th>
                <th class="text-left border-b py-1 pr-2">Cuarto</th>
                <th class="text-left border-b py-1 pr-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let e of d.events">
                <td class="py-1 pr-2">{{ e.eventId }}</td>
                <td class="py-1 pr-2">{{ e.eventType }}</td>
                <td class="py-1 pr-2">{{ e.team }}</td>
                <td class="py-1 pr-2">{{ e.quarter }}</td>
                <td class="py-1 pr-2">{{ e.createdAt | date:'short' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Resumen de faltas por cuarto -->
        <div class="mt-2" *ngIf="foulSummary as fs">
          <div class="font-medium mb-1">Faltas de equipo por cuarto</div>
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th class="text-left border-b py-1 pr-2">Equipo</th>
                <th class="text-left border-b py-1 pr-2">Q1</th>
                <th class="text-left border-b py-1 pr-2">Q2</th>
                <th class="text-left border-b py-1 pr-2">Q3</th>
                <th class="text-left border-b py-1 pr-2">Q4</th>
                <th class="text-left border-b py-1 pr-2">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="py-1 pr-2">HOME ({{ d.game.homeTeam }})</td>
                <td class="py-1 pr-2">{{ teamFouls('HOME',1) }}</td>
                <td class="py-1 pr-2">{{ teamFouls('HOME',2) }}</td>
                <td class="py-1 pr-2">{{ teamFouls('HOME',3) }}</td>
                <td class="py-1 pr-2">{{ teamFouls('HOME',4) }}</td>
                <td class="py-1 pr-2 font-medium">{{ teamFoulsTotal('HOME') }}</td>
              </tr>
              <tr>
                <td class="py-1 pr-2">AWAY ({{ d.game.awayTeam }})</td>
                <td class="py-1 pr-2">{{ teamFouls('AWAY',1) }}</td>
                <td class="py-1 pr-2">{{ teamFouls('AWAY',2) }}</td>
                <td class="py-1 pr-2">{{ teamFouls('AWAY',3) }}</td>
                <td class="py-1 pr-2">{{ teamFouls('AWAY',4) }}</td>
                <td class="py-1 pr-2 font-medium">{{ teamFoulsTotal('AWAY') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Plantillas y faltas por jugador (Q1-Q4, Total) -->
        <div class="grid md:grid-cols-2 gap-4 mt-2">
          <!-- HOME -->
          <div>
            <div class="font-medium mb-1">Plantilla HOME — {{ d.game.homeTeam }}</div>
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr>
                    <th class="text-left border-b py-1 pr-2">#</th>
                    <th class="text-left border-b py-1 pr-2">Jugador</th>
                    <th class="text-left border-b py-1 pr-2">Q1</th>
                    <th class="text-left border-b py-1 pr-2">Q2</th>
                    <th class="text-left border-b py-1 pr-2">Q3</th>
                    <th class="text-left border-b py-1 pr-2">Q4</th>
                    <th class="text-left border-b py-1 pr-2">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of homeRoster">
                  <td class="py-1 pr-2">{{ p.number ?? '—' }}</td>
                  <td class="py-1 pr-2">{{ p.name }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('HOME', p.playerId, 1) }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('HOME', p.playerId, 2) }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('HOME', p.playerId, 3) }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('HOME', p.playerId, 4) }}</td>
                  <td class="py-1 pr-2 font-medium">{{ countPlayerFouls('HOME', p.playerId) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- AWAY -->
          <div>
            <div class="font-medium mb-1">Plantilla AWAY — {{ d.game.awayTeam }}</div>
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr>
                    <th class="text-left border-b py-1 pr-2">#</th>
                    <th class="text-left border-b py-1 pr-2">Jugador</th>
                    <th class="text-left border-b py-1 pr-2">Q1</th>
                    <th class="text-left border-b py-1 pr-2">Q2</th>
                    <th class="text-left border-b py-1 pr-2">Q3</th>
                    <th class="text-left border-b py-1 pr-2">Q4</th>
                    <th class="text-left border-b py-1 pr-2">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of awayRoster">
                  <td class="py-1 pr-2">{{ p.number ?? '—' }}</td>
                  <td class="py-1 pr-2">{{ p.name }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('AWAY', p.playerId, 1) }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('AWAY', p.playerId, 2) }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('AWAY', p.playerId, 3) }}</td>
                  <td class="py-1 pr-2">{{ playerFoulsQ('AWAY', p.playerId, 4) }}</td>
                  <td class="py-1 pr-2 font-medium">{{ countPlayerFouls('AWAY', p.playerId) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  `
})
export class ResultsPageComponent {
  // listado
  all: Game[] = [];
  games: Game[] = [];
  q = '';
  statusFilter: 'ALL' | 'FINISHED' | 'IN_PROGRESS' | 'SCHEDULED' = 'FINISHED';

  // detalle
  selected?: GameDetail;
  homeRoster: Player[] = [];
  awayRoster: Player[] = [];
  foulSummary?: FoulSummary;

  constructor(private api: ApiService) { this.reload(); }

  reload() {
    this.api.listGames().subscribe(gs => {
      this.all = [...gs].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime(); // más reciente primero
      });
      this.applyFilters();
      if (this.selected) this.view(this.selected.game);
    });
  }

  applyFilters() {
    const q = this.q.trim().toLowerCase();
    this.games = this.all.filter(g => {
      const okStatus = this.statusFilter === 'ALL' ? true : g.status === this.statusFilter;
      const okQ = !q || g.homeTeam.toLowerCase().includes(q) || g.awayTeam.toLowerCase().includes(q);
      return okStatus && okQ;
    });
  }

  view(g: Game) {
    forkJoin({
      detail: this.api.getGame(g.gameId),
      home: this.api.listGamePlayers(g.gameId, 'HOME'),
      away: this.api.listGamePlayers(g.gameId, 'AWAY'),
      summary: this.api.getFoulSummary(g.gameId)
    }).subscribe(({ detail, home, away, summary }) => {
      detail.events = [...detail.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.selected = detail;
      this.homeRoster = home;
      this.awayRoster = away;
      this.foulSummary = summary;
    });
  }

  // === Helpers de faltas ===
  countPlayerFouls(team: 'HOME'|'AWAY', playerId: number): number {
    if (!this.foulSummary) return 0;
    return this.foulSummary.players
      .filter(p => p.team === team && p.playerId === playerId)
      .reduce((acc, r) => acc + (r.fouls ?? 0), 0);
  }

  playerFoulsQ(team: 'HOME'|'AWAY', playerId: number, quarter: number): number {
    if (!this.foulSummary) return 0;
    return this.foulSummary.players
      .filter(p => p.team === team && p.playerId === playerId && p.quarter === quarter)
      .reduce((acc, r) => acc + (r.fouls ?? 0), 0);
  }

  teamFouls(team: 'HOME'|'AWAY', quarter: number): number {
    if (!this.foulSummary) return 0;
    return this.foulSummary.team
      .filter(r => r.team === team && r.quarter === quarter)
      .reduce((acc, r) => acc + (r.fouls ?? 0), 0);
  }

  teamFoulsTotal(team: 'HOME'|'AWAY'): number {
    if (!this.foulSummary) return 0;
    return this.foulSummary.team
      .filter(r => r.team === team)
      .reduce((acc, r) => acc + (r.fouls ?? 0), 0);
  }
}
