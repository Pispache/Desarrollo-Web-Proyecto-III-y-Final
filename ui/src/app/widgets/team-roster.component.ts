import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Player } from '../services/api.service';

@Component({
  selector: 'app-team-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team-roster.component.html',
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

  constructor(private api: ApiService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.gameId || !this.side) return;
    this.api.listGamePlayers(this.gameId, this.side).subscribe(ps => (this.players = ps));
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
}