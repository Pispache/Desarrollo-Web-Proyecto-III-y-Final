import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Player, Team } from '../services/api.service';

@Component({
  selector: 'app-admin-team-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-team-roster.component.html',
})
export class AdminTeamRosterComponent {
  teams: Team[] = [];
  selectedTeamId: number | null = null;

  players: Player[] = [];
  loading = false;
  saving = false;
  errorMsg = '';

  // Form nuevo jugador
  pName = '';
  pNumber?: number | null;
  pPosition = '';

  constructor(private api: ApiService) {
    this.loadTeams();
  }

  trackTeam = (_: number, t: Team) => t.teamId;
  trackPlayer = (_: number, p: Player) => p.playerId;

  private loadTeams() {
    this.api.listTeams().subscribe(t => this.teams = t);
  }

  // Recibe string|number desde el template (#teamSel.value)
  onSelectTeam(value: string | number) {
    const id = typeof value === 'string' ? parseInt(value, 10) : value;
    this.selectedTeamId = Number.isFinite(+id) && +id > 0 ? +id : null;
    this.players = [];
    if (this.selectedTeamId !== null) this.loadPlayers();
  }

  private loadPlayers() {
    if (this.selectedTeamId === null) return;
    this.loading = true;
    this.api.listPlayers(this.selectedTeamId).subscribe({
      next: rows => this.players = rows,
      error: () => this.players = [],
      complete: () => this.loading = false,
    });
  }

  createPlayer() {
    if (this.selectedTeamId === null) return;
    const name = this.pName.trim();
    if (!name) { this.errorMsg = 'Nombre requerido'; return; }

    let num: number | undefined;
    if (this.pNumber !== null && this.pNumber !== undefined && this.pNumber !== ('' as any)) {
      if (!Number.isInteger(this.pNumber) || this.pNumber < 0 || this.pNumber > 99) {
        this.errorMsg = 'El número debe ser entero entre 0 y 99.';
        return;
      }
      num = this.pNumber;
    }

    this.saving = true;
    this.errorMsg = '';
    this.api.createPlayer(this.selectedTeamId, { name, number: num, position: this.pPosition || undefined })
      .subscribe({
        next: () => {
          this.pName = ''; this.pNumber = undefined; this.pPosition = '';
          this.loadPlayers();
        },
        error: (err) => {
          this.errorMsg = err?.error?.error || 'No se pudo crear el jugador (¿número duplicado?).';
        },
        complete: () => this.saving = false,
      });
  }

  deletePlayer(p: Player) {
    if (!confirm(`Eliminar a ${p.name}?`)) return;
    this.api.deletePlayer(p.playerId).subscribe(() => this.loadPlayers());
  }
}
