import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminTeamRosterComponent } from '../widgets/admin-team-roster.component';
import { ApiService, Game, GameDetail, Team } from '../services/api.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ControlPanelComponent } from '../widgets/control-panel.component';
import { ClockComponent } from '../widgets/clock.component';
import { TeamRosterComponent } from '../widgets/team-roster.component';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ScoreboardComponent,
    ControlPanelComponent,
    ClockComponent,
    TeamRosterComponent,
    AdminTeamRosterComponent,
  ],
  templateUrl: './home-page.component.html',
})
export class HomePageComponent {
  // filtros / estado
  q = '';
  creating = false;
  advancing = false;

  // NUEVO: nombre del equipo a crear
  newTeamName = '';

  // datos
  teams: Team[] = [];
  games: Game[] = [];
  activeGames: Game[] = [];
  detail: GameDetail | null = null;
  selectedGameId: number | null = null;

  constructor(private api: ApiService) {
    this.reloadAll();
  }

  // ===== API wrappers (lógica mínima) =====
  reloadAll() {
    this.api.listTeams().subscribe((t) => (this.teams = t));
    this.reloadGames();
  }

  reloadGames() {
    this.api.listGames().subscribe((g) => {
      this.games = g;
      this.activeGames = g.filter((game) => game.status === 'IN_PROGRESS');
    });
  }

  view(id: number) {
    this.api.getGame(id).subscribe((d) => (this.detail = d));
  }

  createGame(homeTeamId: number, awayTeamId: number) {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;
    this.creating = true;
    this.api.pairGame(homeTeamId, awayTeamId).subscribe({
      next: ({ gameId }) => {
        this.reloadGames();
        // Abre el panel de control del partido recién creado
        this.view(gameId);
      },
      error: () => {},
      complete: () => (this.creating = false),
    });
  }

  createTeam() {
    const name = this.newTeamName.trim();
    if (!name) return;

    this.creating = true;
    this.api.createTeam(name).subscribe({
      next: () => {
        this.newTeamName = '';
        this.creating = false;
        this.reloadAll();
      },
      error: (err) => {
        console.error('Error creando equipo', err);
        this.creating = false;
      }
    });
  }

  // Maneja el evento de reinicio del juego
  onResetGame() {
    const game = this.detail?.game;
    if (!game) return;

    if (confirm('¿Está seguro que desea reiniciar el juego? Se restablecerán los puntajes, faltas y el reloj.')) {
      this.api.resetGame(game.gameId).subscribe({
        next: () => {
          // Recargar los datos del juego después del reinicio
          this.reloadGames();
          if (this.detail) {
            this.view(this.detail.game.gameId);
          }
        },
        error: (err) => console.error('Error al reiniciar el juego:', err)
      });
    }
  }

  // Hook desde <app-clock> cuando se agota el tiempo del cuarto
  onExpire() {
    const game = this.detail?.game;
    if (!game) return;
    if (game.status === 'IN_PROGRESS' && game.quarter < 4 && !this.advancing) {
      this.advancing = true;
      this.api.advance(game.gameId).subscribe({
        next: () => this.view(game.gameId),
        complete: () => (this.advancing = false),
      });
    }
  }

  // Maneja el ajuste de puntuación desde el scoreboard
  onAdjustScore(adjustment: { homeDelta: number; awayDelta: number }) {
    const gameId = this.detail?.game?.gameId;
    if (!gameId) return;
    
    this.api.adjustScore(gameId, adjustment.homeDelta, adjustment.awayDelta).subscribe({
      next: () => {
        // Actualizar la vista con los nuevos puntajes
        this.view(gameId);
      },
      error: (err: any) => {
        console.error('Error ajustando puntuación', err);
        // Opcional: Mostrar mensaje de error al usuario
        alert('No se pudo ajustar la puntuación. Intente nuevamente.');
      }
    });
  }

  // Seleccionar un juego para administrar
  selectGame(game: Game) {
    this.selectedGameId = game.gameId;
    this.detail = null; // Limpiar detalle anterior
    this.api.getGame(game.gameId).subscribe(detail => {
      this.detail = detail;
      // Desplazar la vista al panel de control del partido
      setTimeout(() => {
        const element = document.getElementById('game-controls');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    });
  }
}