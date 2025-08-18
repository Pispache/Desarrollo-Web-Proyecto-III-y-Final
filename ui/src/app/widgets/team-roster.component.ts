import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Team, Player } from '../services/api.service';

@Component({
  selector: 'app-team-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="grid gap-2 border rounded p-3">
      <div class="font-medium">Gestionar jugadores</div>

      <div class="flex flex-wrap gap-2 items-center" *ngIf="teams as ts">
        <select [(ngModel)]="teamId" class="border rounded px-2 py-1" (change)="loadPlayers()">
          <option [ngValue]="undefined">— Selecciona equipo —</option>
          <option *ngFor="let t of ts" [ngValue]="t.teamId">{{ t.teamId }} — {{ t.name }}</option>
        </select>
      </div>

      <div *ngIf="teamId" class="grid gap-2">
        <!-- Alta rápida -->
        <div class="flex flex-wrap gap-2 items-center">
          <input [(ngModel)]="newName" placeholder="Nombre jugador" class="border rounded px-2 py-1" />
          <input [(ngModel)]="newNumber" type="number" placeholder="# (opcional)" class="border rounded px-2 py-1 w-28" />
          <input [(ngModel)]="newPos" placeholder="Posición (G/F/C)" class="border rounded px-2 py-1 w-36" />
          <button class="border rounded px-3 py-1" (click)="add()">Agregar</button>
        </div>

        <!-- Lista -->
        <table class="w-full text-sm border-collapse" *ngIf="players.length; else noPlayers">
          <thead>
            <tr>
              <th class="text-left border-b py-1 pr-2">#</th>
              <th class="text-left border-b py-1 pr-2">Nombre</th>
              <th class="text-left border-b py-1 pr-2">Pos.</th>
              <th class="text-left border-b py-1 pr-2">Activo</th>
              <th class="text-left border-b py-1 pr-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of players">
              <td class="py-1 pr-2">{{ p.number ?? '—' }}</td>
              <td class="py-1 pr-2">{{ p.name }}</td>
              <td class="py-1 pr-2">{{ p.position || '—' }}</td>
              <td class="py-1 pr-2">{{ p.active ? 'Sí' : 'No' }}</td>
              <td class="py-1 pr-2 whitespace-nowrap">
                <button class="border rounded px-2 py-0.5 mr-2" (click)="toggleActive(p)">{{ p.active ? 'Desactivar' : 'Activar' }}</button>
                <button class="border rounded px-2 py-0.5" (click)="remove(p)">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
        <ng-template #noPlayers><div class="text-sm text-gray-600">Sin jugadores registrados.</div></ng-template>
      </div>
    </div>
  `
})
export class TeamRosterComponent {
  teams: Team[] = [];
  teamId?: number;
  players: Player[] = [];

  newName = '';
  newNumber?: number;
  newPos = '';

  constructor(private api: ApiService) {
    // cargar equipos al entrar
    this.api.listTeams().subscribe(ts => this.teams = ts);
  }

  loadPlayers() {
    if (!this.teamId) { this.players = []; return; }
    this.api.listPlayers(this.teamId).subscribe(ps => this.players = ps);
  }

  add() {
    const name = this.newName.trim();
    if (!this.teamId || !name) return;
    this.api.createPlayer(this.teamId, { name, number: this.newNumber, position: this.newPos || undefined })
      .subscribe(() => {
        this.newName = ''; this.newNumber = undefined; this.newPos = '';
        this.loadPlayers();
      });
  }

  toggleActive(p: Player) {
    this.api.updatePlayer(p.playerId, { active: !p.active }).subscribe(() => this.loadPlayers());
  }

  remove(p: Player) {
    if (!confirm(`Eliminar a ${p.name}?`)) return;
    this.api.deletePlayer(p.playerId).subscribe(() => this.loadPlayers());
  }
}
