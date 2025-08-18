import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, GameDetail } from '../services/api.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ControlPanelComponent } from '../widgets/control-panel.component';
import { ClockComponent } from '../widgets/clock.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, FormsModule, ScoreboardComponent, ControlPanelComponent, ClockComponent],
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
  home = 'Leones';
  away = 'Panteras';
  gameId?: number;
  detail?: GameDetail;
  private advancing = false; // evita doble avance por si acaso

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

  // Llamado cuando el reloj llega a 00:00
  onExpire() {
    if (!this.detail) return;
    const g = this.detail.game;

    // Si está en progreso y aún no es el 4º cuarto, avanzamos
    if (g.status === 'IN_PROGRESS' && g.quarter < 4 && !this.advancing) {
      this.advancing = true;
      this.api.advance(g.gameId).subscribe({
        next: () => this.reload(),
        error: () => {},
        complete: () => (this.advancing = false)
      });
    }
    // Si es el 4º cuarto podrías finalizar automáticamente:
    // else if (g.status === 'IN_PROGRESS' && g.quarter === 4) {
    //   this.api.finish(g.gameId).subscribe(() => this.reload());
    // }
  }
}
