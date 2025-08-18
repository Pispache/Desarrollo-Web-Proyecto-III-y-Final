import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Game } from '../services/api.service';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="p-4 grid gap-3 border rounded">
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

    <!-- HOME -->
    <div class="flex flex-wrap gap-2 items-center">
      <span class="font-medium">HOME:</span>

      <button class="border rounded px-3 py-1" (click)="score('HOME',1)" [disabled]="disabledScore()">+1</button>
      <button class="border rounded px-3 py-1" (click)="score('HOME',2)" [disabled]="disabledScore()">+2</button>
      <button class="border rounded px-3 py-1" (click)="score('HOME',3)" [disabled]="disabledScore()">+3</button>

      <!-- Selección de jugador opcional para falta -->
      <select [(ngModel)]="selHomePlayerId" class="border rounded px-2 py-1" [disabled]="!homePlayers.length">
        <option [ngValue]="undefined">Jugador HOME (opcional)</option>
        <option *ngFor="let p of homePlayers" [ngValue]="p.playerId">
          {{ p.number ? ('#'+p.number+' ') : '' }}{{ p.name }}
        </option>
      </select>

      <button class="border rounded px-3 py-1" (click)="foul('HOME')" [disabled]="disabledScore()">Foul</button>

      <!-- Contador de faltas de equipo en el cuarto actual -->
      <span class="ml-2 text-sm" [class.text-red-600]="teamFouls.home >= 5">
        Faltas HOME (Q{{game?.quarter}}): {{ teamFouls.home }} {{ teamFouls.home >= 5 ? '(Penalización)' : '' }}
      </span>
    </div>

    <!-- AWAY -->
    <div class="flex flex-wrap gap-2 items-center">
      <span class="font-medium">AWAY:</span>

      <button class="border rounded px-3 py-1" (click)="score('AWAY',1)" [disabled]="disabledScore()">+1</button>
      <button class="border rounded px-3 py-1" (click)="score('AWAY',2)" [disabled]="disabledScore()">+2</button>
      <button class="border rounded px-3 py-1" (click)="score('AWAY',3)" [disabled]="disabledScore()">+3</button>

      <!-- Selección de jugador opcional para falta -->
      <select [(ngModel)]="selAwayPlayerId" class="border rounded px-2 py-1" [disabled]="!awayPlayers.length">
        <option [ngValue]="undefined">Jugador AWAY (opcional)</option>
        <option *ngFor="let p of awayPlayers" [ngValue]="p.playerId">
          {{ p.number ? ('#'+p.number+' ') : '' }}{{ p.name }}
        </option>
      </select>

      <button class="border rounded px-3 py-1" (click)="foul('AWAY')" [disabled]="disabledScore()">Foul</button>

      <!-- Contador de faltas de equipo en el cuarto actual -->
      <span class="ml-2 text-sm" [class.text-red-600]="teamFouls.away >= 5">
        Faltas AWAY (Q{{game?.quarter}}): {{ teamFouls.away }} {{ teamFouls.away >= 5 ? '(Penalización)' : '' }}
      </span>
    </div>
  </div>
  `
})
export class ControlPanelComponent implements OnChanges {
  @Input() game?: Game;
  @Output() changed = new EventEmitter<void>();

  // Listas de jugadores del partido (lado HOME/AWAY)
  homePlayers: any[] = [];
  awayPlayers: any[] = [];

  // Selección actual para registrar falta por jugador
  selHomePlayerId?: number;
  selAwayPlayerId?: number;

  // Conteo de faltas del cuarto actual
  teamFouls = { home: 0, away: 0 };

  constructor(private api: ApiService) {}

  ngOnChanges(ch: SimpleChanges) {
    if (!this.game) return;

    // cargar jugadores del partido por lado
    this.api.listGamePlayers(this.game.gameId, 'HOME').subscribe(p => this.homePlayers = p);
    this.api.listGamePlayers(this.game.gameId, 'AWAY').subscribe(p => this.awayPlayers = p);

    // actualizar contadores de faltas por cuarto
    this.refreshFouls();
  }

  private refresh() { this.changed.emit(); }

  private refreshFouls() {
    if (!this.game) return;
    this.api.getFoulSummary(this.game.gameId).subscribe(s => {
      const q = this.game!.quarter;
      const th = s.team.find(r => r.quarter === q && r.team === 'HOME')?.fouls ?? 0;
      const ta = s.team.find(r => r.quarter === q && r.team === 'AWAY')?.fouls ?? 0;
      this.teamFouls = { home: th, away: ta };
    });
  }

  disabledScore() { return this.game?.status !== 'IN_PROGRESS'; }

  start()   { if(!this.game) return; this.api.start(this.game.gameId).subscribe(() => this.refresh()); }
  advance() { if(!this.game) return; this.api.advance(this.game.gameId).subscribe(() => { this.refresh(); this.refreshFouls(); }); }
  finish()  { if(!this.game) return; this.api.finish(this.game.gameId).subscribe(() => { this.refresh(); this.refreshFouls(); }); }
  undo()    { if(!this.game) return; this.api.undo(this.game.gameId).subscribe(() => { this.refresh(); this.refreshFouls(); }); }

  score(team:'HOME'|'AWAY', points:1|2|3) {
    if(!this.game) return;
    // Si luego quieres asociar anotador: pasa { playerId: this.selHomePlayerId/selAwayPlayerId } como cuarto parámetro
    this.api.score(this.game.gameId, team, points).subscribe(() => this.refresh());
  }

  foul(team:'HOME'|'AWAY') {
    if(!this.game) return;
    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    this.api.foul(this.game.gameId, team, { playerId }).subscribe(() => {
      this.refresh();
      this.refreshFouls();
    });
  }
}
