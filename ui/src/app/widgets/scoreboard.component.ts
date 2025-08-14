import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Game } from '../services/api.service';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="p-4 grid gap-2 border rounded">
    <div class="text-xl font-semibold">Marcador</div>
    <div class="grid grid-cols-3 items-center gap-2">
      <div class="text-right text-lg font-medium">{{game?.homeTeam}}</div>
      <div class="text-center text-3xl font-bold">
        {{game?.homeScore}} - {{game?.awayScore}}
      </div>
      <div class="text-left text-lg font-medium">{{game?.awayTeam}}</div>
    </div>
    <div class="text-center text-sm">
      Cuarto: <strong>{{game?.quarter}}</strong> |
      Estado: <strong>{{game?.status}}</strong>
    </div>
  </div>
  `
})
export class ScoreboardComponent {
  @Input() game?: Game;
}
