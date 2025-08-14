import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Game } from '../services/api.service';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="p-4 grid gap-2 border rounded">
    <div class="font-medium">Controles</div>

    <div class="flex flex-wrap gap-2">
      <button class="border rounded px-3 py-1"
              (click)="start()" [disabled]="game?.status!=='SCHEDULED'">Start</button>

      <button class="border rounded px-3 py-1"
              (click)="advance()"
              [disabled]="game?.status!=='IN_PROGRESS' || (game?.quarter ?? 1) >= 4">Advance</button>

      <button class="border rounded px-3 py-1"
              (click)="finish()" [disabled]="game?.status!=='IN_PROGRESS'">Finish</button>

      <button class="border rounded px-3 py-1"
              (click)="undo()" [disabled]="!game">Undo</button>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <span class="font-medium">HOME:</span>
      <button class="border rounded px-3 py-1" (click)="score('HOME',1)" [disabled]="disabledScore()">+1</button>
      <button class="border rounded px-3 py-1" (click)="score('HOME',2)" [disabled]="disabledScore()">+2</button>
      <button class="border rounded px-3 py-1" (click)="score('HOME',3)" [disabled]="disabledScore()">+3</button>
      <button class="border rounded px-3 py-1" (click)="foul('HOME')" [disabled]="disabledScore()">Foul</button>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <span class="font-medium">AWAY:</span>
      <button class="border rounded px-3 py-1" (click)="score('AWAY',1)" [disabled]="disabledScore()">+1</button>
      <button class="border rounded px-3 py-1" (click)="score('AWAY',2)" [disabled]="disabledScore()">+2</button>
      <button class="border rounded px-3 py-1" (click)="score('AWAY',3)" [disabled]="disabledScore()">+3</button>
      <button class="border rounded px-3 py-1" (click)="foul('AWAY')" [disabled]="disabledScore()">Foul</button>
    </div>
  </div>
  `
})
export class ControlPanelComponent {
  @Input() game?: Game;
  @Output() changed = new EventEmitter<void>();

  constructor(private api: ApiService) {}

  private refresh() { this.changed.emit(); }
  disabledScore() { return this.game?.status !== 'IN_PROGRESS'; }

  start()   { if(!this.game) return; this.api.start(this.game.gameId).subscribe(() => this.refresh()); }
  advance() { if(!this.game) return; this.api.advance(this.game.gameId).subscribe(() => this.refresh()); }
  finish()  { if(!this.game) return; this.api.finish(this.game.gameId).subscribe(() => this.refresh()); }
  undo()    { if(!this.game) return; this.api.undo(this.game.gameId).subscribe(() => this.refresh()); }

  score(team:'HOME'|'AWAY', points:1|2|3) {
    if(!this.game) return;
    this.api.score(this.game.gameId, team, points).subscribe(() => this.refresh());
  }
  foul(team:'HOME'|'AWAY') {
    if(!this.game) return;
    this.api.foul(this.game.gameId, team).subscribe(() => this.refresh());
  }
}
