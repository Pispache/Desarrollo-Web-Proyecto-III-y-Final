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
  @Input() canEdit: boolean = false;

  players: Player[] = [];

  showAddPlayerForm = false;
  newPlayer = {
    name: '',
    number: null as number | null,
    position: '',
    heightCm: null as number | null,
    age: null as number | null,
    nationality: ''
  };
  isLoading = false;
  error: string | null = null;

  // Edición inline
  editingPlayerId: number | null = null;
  editModel: { name: string; number: number | null; position: string; heightCm: number | null; age: number | null; nationality: string } = { name: '', number: null, position: '', heightCm: null, age: null, nationality: '' };

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
    if (!this.canEdit) return;
    this.showAddPlayerForm = !this.showAddPlayerForm;
    this.error = null;
    if (this.showAddPlayerForm) {
      this.resetNewPlayerForm();
    }
  }

  addPlayer() {
    if (!this.canEdit) return;
    if (!this.newPlayer.name.trim()) {
      this.error = 'El nombre es requerido';
      return;
    }
    // Validar número duplicado (si se indicó)
    if (this.newPlayer.number != null && this.isNumberDuplicate(this.newPlayer.number)) {
      this.error = `El número ${this.newPlayer.number} ya está asignado a otro jugador de este equipo`;
      return;
    }
    // Validaciones básicas de edad y estatura
    if (this.newPlayer.age != null) {
      const a = Number(this.newPlayer.age);
      if (!Number.isInteger(a) || a < 8 || a > 70) { this.error = 'La edad debe estar entre 8 y 70'; return; }
    }
    if (this.newPlayer.heightCm != null) {
      const h = Number(this.newPlayer.heightCm);
      if (h < 100 || h > 260) { this.error = 'La estatura debe estar entre 100 y 260 cm'; return; }
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
          position: this.newPlayer.position.trim() || undefined,
          heightCm: this.newPlayer.heightCm != null ? Number(this.newPlayer.heightCm) : undefined,
          age: this.newPlayer.age != null ? Number(this.newPlayer.age) : undefined,
          nationality: (this.newPlayer.nationality || '').trim() || undefined,
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
      position: '',
      heightCm: null,
      age: null,
      nationality: ''
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
    if (!this.canEdit) return;
    this.editingPlayerId = p.playerId;
    this.editModel = {
      name: p.name || '',
      number: (p.number as any) ?? null,
      position: (p.position as any) || '',
      heightCm: (p.heightCm as any) ?? null,
      age: (p.age as any) ?? null,
      nationality: (p.nationality as any) || ''
    };
    this.error = null;
  }

  cancelEdit() {
    this.editingPlayerId = null;
    this.error = null;
  }

  saveEdit(p: Player) {
    if (!this.canEdit) return;
    if (!this.editingPlayerId) return;
    if (!this.editModel.name.trim()) { this.error = 'El nombre es requerido'; return; }
    // Validar número duplicado excluyendo al jugador en edición
    if (this.editModel.number != null && this.isNumberDuplicate(this.editModel.number, this.editingPlayerId)) {
      this.error = `El número ${this.editModel.number} ya está asignado a otro jugador de este equipo`;
      return;
    }
    // Validaciones básicas
    if (this.editModel.age != null) {
      const a = Number(this.editModel.age);
      if (!Number.isInteger(a) || a < 8 || a > 70) { this.error = 'La edad debe estar entre 8 y 70'; return; }
    }
    if (this.editModel.heightCm != null) {
      const h = Number(this.editModel.heightCm);
      if (h < 100 || h > 260) { this.error = 'La estatura debe estar entre 100 y 260 cm'; return; }
    }
    this.isLoading = true;
    this.api.updatePlayer(this.editingPlayerId, {
      name: this.editModel.name.trim(),
      number: this.editModel.number != null ? Number(this.editModel.number) : (undefined as any),
      position: this.editModel.position?.trim() || (undefined as any),
      heightCm: this.editModel.heightCm != null ? Number(this.editModel.heightCm) : (undefined as any),
      age: this.editModel.age != null ? Number(this.editModel.age) : (undefined as any),
      nationality: this.editModel.nationality?.trim() || (undefined as any),
    }).subscribe({
      next: () => { this.isLoading = false; this.editingPlayerId = null; this.loadPlayers(); },
      error: (err) => { console.error('Error actualizando jugador:', err); this.isLoading = false; this.error = 'No se pudo actualizar el jugador'; }
    });
  }

  deletePlayer(p: Player) {
    if (!this.canEdit) return;
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