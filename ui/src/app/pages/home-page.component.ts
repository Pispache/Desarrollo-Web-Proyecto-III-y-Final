import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, GameDetail, Game, Team } from '../services/api.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ControlPanelComponent } from '../widgets/control-panel.component';
import { ClockComponent } from '../widgets/clock.component';
import { RouterModule } from '@angular/router'; 
 import { Observable, map, shareReplay } from 'rxjs';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ScoreboardComponent, ControlPanelComponent, ClockComponent,RouterModule],
  template: `
    <div class="p-4 grid gap-4 max-w-3xl mx-auto">
      <h1 class="text-2xl font-semibold">Marcador de Baloncesto</h1>

      <!-- Registrar equipo -->
      <div class="grid gap-2 border rounded p-3">
        <div class="font-medium">Registrar equipo</div>
        <div class="flex flex-wrap gap-2 items-center">
          <input [(ngModel)]="teamName" placeholder="Nombre de equipo" class="border rounded px-2 py-1" />
          <button class="border rounded px-3 py-1" (click)="addTeam()">Agregar</button>
          <span class="text-xs text-gray-500 ml-2">Equipos registrados: {{ (teams$ | async)?.length || 0 }}</span>
        </div>
        <div class="text-sm text-gray-700" *ngIf="teams$ | async as teams">
          <div *ngIf="teams.length; else noTeams">
            <ul class="list-disc ml-5">
              <li *ngFor="let t of teams">{{ t.teamId }} — {{ t.name }}</li>
            </ul>
          </div>
          <ng-template #noTeams>Sin equipos aún.</ng-template>
        </div>
      </div>

      <!-- Emparejar partido desde equipos -->
      <div class="grid gap-2 border rounded p-3">
        <div class="font-medium">Emparejar partido</div>
        <div class="flex flex-wrap gap-2 items-center" *ngIf="teams$ | async as teams">
          <select [(ngModel)]="pairHomeId" class="border rounded px-2 py-1">
            <option [ngValue]="undefined">— Local —</option>
            <option *ngFor="let t of teams" [ngValue]="t.teamId">{{ t.teamId }} — {{ t.name }}</option>
          </select>
          <select [(ngModel)]="pairAwayId" class="border rounded px-2 py-1">
            <option [ngValue]="undefined">— Visitante —</option>
            <option *ngFor="let t of teams" [ngValue]="t.teamId">{{ t.teamId }} — {{ t.name }}</option>
          </select>
          <button class="border rounded px-3 py-1"
                  (click)="pair()"
                  [disabled]="!pairHomeId || !pairAwayId || pairHomeId===pairAwayId">
            Crear partido
          </button>
        </div>
      </div>
      <!-- Lista de partidos recientes (ID + equipos) -->
      <div class="border rounded p-3">
      <div class="flex items-center justify-between mb-2">
        <div class="font-medium">Partidos recientes</div>
        <div class="flex gap-2">
          <button class="border rounded px-2 py-1" (click)="reloadList()">Actualizar</button>
          <a class="border rounded px-2 py-1 bg-gray-100" routerLink="/results">Ver resultados</a>
        </div>
      </div>
      </div>

      <!-- Link a vista pública del juego cargado -->
      <div *ngIf="detail as d" class="text-sm">
        Vista pública:
        <a class="underline text-blue-600" [href]="'/display/' + d.game.gameId" target="_blank" rel="noopener">
          /display/{{ d.game.gameId }}
        </a>
      </div>

      <!-- Detalle -->
      <ng-container *ngIf="detail as d; else emptyState">
        <app-scoreboard [game]="d.game"></app-scoreboard>

        <app-clock
          [gameId]="d.game.gameId"
          [status]="d.game.status"
          [quarter]="d.game.quarter"
          (expired)="onExpire()">
        </app-clock>

        <app-control-panel [game]="d.game" (changed)="reload()"></app-control-panel>

        <div class="border rounded p-3">
          <div class="font-medium mb-2">Eventos</div>
          <pre class="text-sm overflow-auto">{{ d.events | json }}</pre>
        </div>
      </ng-container>

      <ng-template #emptyState>
        <div class="text-gray-600">Crea o carga un juego para comenzar.</div>
      </ng-template>
    </div>
  `
})
export class HomePageComponent {
  // Crear/Cargar directos
  home = '';
  away = '';
  gameId?: number;

  // Detalle y lista
  detail?: GameDetail;
  games$!: Observable<Game[]>;

  // NUEVO: equipos y emparejar
  teams$!: Observable<Team[]>;
  teamName = '';
  pairHomeId?: number;
  pairAwayId?: number;

  private advancing = false;

  constructor(private api: ApiService) {
    this.reloadList();
    this.reloadTeams(); // carga equipos al entrar
  }

  // ===== Equipos
  reloadTeams() {
    this.teams$ = this.api.listTeams().pipe(
      map(ts => ts.slice().sort((a, b) => a.teamId - b.teamId)), // (o por nombre)
      shareReplay(1) // <-- evita múltiples GET por múltiples async pipes
    );
  }
  addTeam() {
    const name = this.teamName.trim();
    if (!name) return;
    this.api.createTeam(name).subscribe(() => {
      this.teamName = '';
      this.reloadTeams();
    });
  }

  pair() {
    if (!this.pairHomeId || !this.pairAwayId || this.pairHomeId === this.pairAwayId) return;
    this.api.pairGame(this.pairHomeId, this.pairAwayId).subscribe(r => {
      this.gameId = r.gameId;   // carga el nuevo partido
      this.reloadList();
      this.load();
    });
  }

  // ===== Lista de juegos
  reloadList() { this.games$ = this.api.listGames(); }

  loadFromList(g: Game) {
    this.gameId = g.gameId;
    this.load();
  }

  // ===== Crear / Cargar / Refrescar detalle
  create() {
    this.api.createGame(this.home, this.away).subscribe(r => {
      this.gameId = r.gameId;
      this.reloadList();
      this.load();
    });
  }

  load() {
    if (!this.gameId) return;
    this.api.getGame(this.gameId).subscribe(d => this.detail = d);
  }

  reload() {
    if (!this.detail) return;
    this.api.getGame(this.detail.game.gameId).subscribe(d => this.detail = d);
    this.reloadList(); // por si cambió estado/puntaje en la lista
  }

  // Llamado cuando el reloj llega a 00:00
  onExpire() {
    if (!this.detail) return;
    const g = this.detail.game;

    if (g.status === 'IN_PROGRESS' && g.quarter < 4 && !this.advancing) {
      this.advancing = true;
      this.api.advance(g.gameId).subscribe({
        next: () => this.reload(),
        error: () => {},
        complete: () => (this.advancing = false)
      });
    }
  }
}
