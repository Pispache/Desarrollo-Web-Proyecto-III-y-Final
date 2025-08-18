import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Game, GameDetail } from '../services/api.service';

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
      <div *ngIf="selected as d" class="border rounded p-3 grid gap-2">
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

        <div class="mt-2">
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

  constructor(private api: ApiService) { this.reload(); }

  reload() {
    this.api.listGames().subscribe(gs => {
      this.all = [...gs].sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime(); // más reciente primero
      });
      this.applyFilters();
      // si hay un detalle abierto, refrescarlo
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
    this.api.getGame(g.gameId).subscribe(d => {
      // opcional: ordenar eventos por fecha desc, por si vienen ya así
      d.events = [...d.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.selected = d;
    });
  }
}
