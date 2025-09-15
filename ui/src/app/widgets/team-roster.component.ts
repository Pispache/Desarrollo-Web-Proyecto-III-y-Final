import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Player } from '../services/api.service';

@Component({
  selector: 'app-team-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team-roster.component.html',
  styleUrls: ['./team-roster.component.scss']
})
export class TeamRosterComponent implements OnChanges {
  @Input({ required: true }) gameId!: number;
  @Input({ required: true }) side!: 'HOME' | 'AWAY';

  players: Player[] = [];

  showAddPlayerForm = false;
  newPlayer = {
    name: '',
    number: null as number | null,
    position: ''
  };
  isLoading = false;
  error: string | null = null;

  // Edición inline
  editingPlayerId: number | null = null;
  editModel: { name: string; number: number | null; position: string } = { name: '', number: null, position: '' };

  constructor(private api: ApiService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.gameId || !this.side) return;
    this.api.listGamePlayers(this.gameId, this.side).subscribe(ps => (this.players = ps));
  }

  // ====== Validaciones ======
  private isNumberDuplicate(num: number | null, excludeId?: number | null): boolean {
    if (num == null) return false;
    const n = Number(num);
    return this.players.some(pl => pl.playerId !== (excludeId ?? null) && (pl.number as any) != null && Number(pl.number as any) === n);
  }

  toggleAddPlayerForm() {
    this.showAddPlayerForm = !this.showAddPlayerForm;
    this.error = null;
    if (this.showAddPlayerForm) {
      this.resetNewPlayerForm();
    }
  }

  addPlayer() {
    if (!this.newPlayer.name.trim()) {
      this.error = 'El nombre es requerido';
      return;
    }
    // Validar número duplicado (si se indicó)
    if (this.newPlayer.number != null && this.isNumberDuplicate(this.newPlayer.number)) {
      this.error = `El número ${this.newPlayer.number} ya está asignado a otro jugador de este equipo`;
      return;
    }

    this.isLoading = true;
    this.error = null;

    // Obtener el teamId del juego actual para el equipo correspondiente
    this.api.getGame(this.gameId).subscribe({
      next: (gameDetail) => {
        const game = gameDetail.game;
        const teamId = this.side === 'HOME' ? (game as any).homeTeamId : (game as any).awayTeamId;
        if (!teamId) {
          this.error = 'No se pudo determinar el equipo';
          this.isLoading = false;
          return;
        }

        // Crear el jugador
        this.api.createPlayer(teamId, {
          name: this.newPlayer.name.trim(),
          number: this.newPlayer.number ? Number(this.newPlayer.number) : undefined,
          position: this.newPlayer.position.trim() || undefined
        }).subscribe({
          next: () => {
            this.loadPlayers();
            this.showAddPlayerForm = false;
            this.isLoading = false;
          },
          error: (err) => {
            console.error('Error al crear jugador:', err);
            this.error = 'Error al crear el jugador. Intente nuevamente.';
            this.isLoading = false;
          }
        });
      },
      error: (err) => {
        console.error('Error al obtener detalles del juego:', err);
        this.error = 'Error al cargar la información del juego';
        this.isLoading = false;
      }
    });
  }

  private resetNewPlayerForm() {
    this.newPlayer = {
      name: '',
      number: null,
      position: ''
    };
  }

  private loadPlayers() {
    if (!this.gameId || !this.side) return;
    this.api.listGamePlayers(this.gameId, this.side).subscribe({
      next: (players) => this.players = players,
      error: (err) => {
        console.error('Error al cargar jugadores:', err);
        this.error = 'Error al cargar la lista de jugadores';
      }
    });
  }

  // ====== Edición ======
  startEdit(p: Player) {
    this.editingPlayerId = p.playerId;
    this.editModel = {
      name: p.name || '',
      number: (p.number as any) ?? null,
      position: (p.position as any) || ''
    };
    this.error = null;
  }

  cancelEdit() {
    this.editingPlayerId = null;
    this.error = null;
  }

  saveEdit(p: Player) {
    if (!this.editingPlayerId) return;
    if (!this.editModel.name.trim()) { this.error = 'El nombre es requerido'; return; }
    // Validar número duplicado excluyendo al jugador en edición
    if (this.editModel.number != null && this.isNumberDuplicate(this.editModel.number, this.editingPlayerId)) {
      this.error = `El número ${this.editModel.number} ya está asignado a otro jugador de este equipo`;
      return;
    }
    this.isLoading = true;
    this.api.updatePlayer(this.editingPlayerId, {
      name: this.editModel.name.trim(),
      number: this.editModel.number != null ? Number(this.editModel.number) : (undefined as any),
      position: this.editModel.position?.trim() || (undefined as any)
    }).subscribe({
      next: () => { this.isLoading = false; this.editingPlayerId = null; this.loadPlayers(); },
      error: (err) => { console.error('Error actualizando jugador:', err); this.isLoading = false; this.error = 'No se pudo actualizar el jugador'; }
    });
  }

  deletePlayer(p: Player) {
    if (!p?.playerId) return;
    const ok = window.confirm(`¿Eliminar al jugador ${p.name || '#'+(p.number ?? '')}?`);
    if (!ok) return;
    this.isLoading = true;
    this.api.deletePlayer(p.playerId).subscribe({
      next: () => { this.isLoading = false; this.loadPlayers(); },
      error: (err) => { console.error('Error eliminando jugador:', err); this.isLoading = false; this.error = 'No se pudo eliminar el jugador'; }
    });
  }
}