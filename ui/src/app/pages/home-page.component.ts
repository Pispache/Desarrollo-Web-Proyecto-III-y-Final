import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, GameDetail } from '../services/api.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ControlPanelComponent } from '../widgets/control-panel.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ScoreboardComponent, ControlPanelComponent],
  template: `
    <div class="p-4 grid gap-4 max-w-3xl mx-auto">
      <h1 class="text-2xl font-semibold">Marcador de Baloncesto</h1>

      <div class="grid gap-2 border rounded p-3">
        <div class="font-medium">Crear o cargar juego</div>
        <div class="flex flex-wrap gap-2 items-center">
          <input [(ngModel)]="home" placeholder="Home" class="border rounded px-2 py-1" />
          <input [(ngModel)]="away" placeholder="Away" class="border rounded px-2 py-1" />
          <button class="border rounded px-3 py-1" (click)="create()">Crear</button>

          <input [(ngModel)]="gameId" type="number" placeholder="ID" class="border rounded px-2 py-1 ml-4" />
          <button class="border rounded px-3 py-1" (click)="load()">Cargar</button>
        </div>
      </div>

      <ng-container *ngIf="detail as d; else emptyState">
        <app-scoreboard [game]="d.game"></app-scoreboard>
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
  home = 'Leones';
  away = 'Panteras';
  gameId?: number;
  detail?: GameDetail;

  constructor(private api: ApiService) {}

  create() {
    this.api.createGame(this.home, this.away).subscribe(r => {
      this.gameId = r.gameId;
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
  }
}
