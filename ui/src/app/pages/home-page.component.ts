import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService, Game, GameDetail, Team } from '../services/api.service';
import { ClockService } from '../services/clock.service';

import { NotificationService } from '../services/notification.service';
import { SoundService } from '../services/sound.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ControlPanelComponent } from '../widgets/control-panel.component';
import { ClockComponent } from '../widgets/clock.component';
import { TeamRosterComponent } from '../widgets/team-roster.component';
import { FilterPipe } from '../pipes/filter.pipe';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-home-page',
  standalone: true,
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ScoreboardComponent,
    ControlPanelComponent,
    ClockComponent,
    TeamRosterComponent,
    FilterPipe,
  ]
})
export class HomePageComponent {
  // filtros / estado
  teamSearch = '';
  creating = false;
  advancing = false;

  // NUEVO: nombre del equipo a crear
  newTeamName = '';
  
  /**
   * Valida que solo se ingresen letras en el nombre del equipo
   * La expresión regular /[^A-Za-záéíóúÁÉÍÓÚüÜñÑ\s]/g elimina todo lo que NO sean:
   * - Letras mayúsculas y minúsculas (A-Z, a-z)
   * - Vocales con acentos (áéíóú, ÁÉÍÓÚ)
   * - Letra ñ y ü (mayúsculas y minúsculas)
   * - Espacios en blanco
   */
  onTeamNameInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const originalValue = input.value;
    
    // Remover caracteres no deseados usando una expresión regular
    const cleanValue = originalValue.replace(/[^A-Za-záéíóúÁÉÍÓÚüÜñÑ\s]/g, '');
    
    // Mostrar notificación si se detectaron caracteres no permitidos
    if (originalValue !== cleanValue) {
      this.showInvalidCharWarning = true;
      // Ocultar el mensaje después de 3 segundos
      setTimeout(() => this.showInvalidCharWarning = false, 3000);
    }
    
    // Actualizar el valor del modelo con el texto limpio
    if (input.value !== cleanValue) {
      input.value = cleanValue;
      this.newTeamName = cleanValue;
      // Disparar evento de input para actualizar la validación
      input.dispatchEvent(new Event('input'));
    }
  }

  // datos
  teams: Team[] = [];
  games: Game[] = [];
  activeGames: Game[] = [];
  detail: GameDetail | null = null;
  selectedGameId: number | null = null;
  autoAdvanceEnabled = localStorage.getItem('clock.autoAdvance') === '1';

  // Bandera para mostrar notificación de caracteres no permitidos
  showInvalidCharWarning = false;
  
  constructor(private api: ApiService, private notify: NotificationService, private sound: SoundService, private clock: ClockService) {
    this.reloadAll();
    // Asegurar que los sonidos estén precargados para reproducir en auto-advance
    try { this.sound.preloadAll(); } catch {}
  }

  // Handle game status changes
  private handleStatusChange(operation: Promise<any>, successMessage: string) {
    operation.then((response) => {
      this.reloadGames();
      if (this.detail) {
        this.view(this.detail.game.gameId);
      }
      alert(successMessage);
    }).catch(error => {
      console.error('Error en handleStatusChange:', error);
      const errorMessage = error?.error?.error || 'Ocurrió un error al actualizar el estado del partido.';
      alert(`Error: ${errorMessage}`);
    });
  }

  // Game status control methods
  finishGame(gameId: number) {
    if (confirm('¿Está seguro que desea marcar este partido como finalizado?')) {
      this.handleStatusChange(
        this.api.finish(gameId).toPromise(),
        'Partido finalizado correctamente.'
      );
    }
  }

  suspendGame(gameId: number) {
    if (confirm('¿Está seguro que desea suspender este partido? Podrá reanudarlo más tarde.')) {
      this.handleStatusChange(
        this.api.suspendGame(gameId).toPromise(),
        'Partido suspendido correctamente.'
      );
    }
  }

  resumeGame(gameId: number) {
    this.handleStatusChange(
      this.api.resumeGame(gameId).toPromise(),
      'Partido reanudado correctamente.'
    );
  }

  cancelGame(gameId: number) {
    if (confirm('¿Está seguro que desea cancelar este partido? Esta acción no se puede deshacer.')) {
      this.api.cancelGame(gameId).subscribe({
        next: () => {
          this.reloadGames();
          if (this.detail?.game.gameId === gameId) {
            this.view(gameId);
          }
          alert('Partido cancelado correctamente.');
        },
        error: (error) => {
          console.error('Error al cancelar el partido:', error);
          const errorMessage = error?.error?.error || 'No se pudo cancelar el partido. Intente nuevamente.';
          alert(`Error: ${errorMessage}`);
        }
      });
    }
  }

  // Iniciar un partido programado
  startGame(gameId: number) {
    if (confirm('¿Está seguro que desea iniciar este partido?')) {
      this.api.start(gameId).subscribe({
        next: () => {
          this.reloadGames();
          this.view(gameId);
          // Iniciar el reloj backend y notificar a los suscriptores (Display)
          this.clock.start(gameId);
        },
        error: (err: any) => {
          console.error('Error al iniciar el partido:', err);
          alert('No se pudo iniciar el partido. Intente nuevamente.');
        }
      });
    }
  }

  // ===== API wrappers (lógica mínima) =====
  // Check if there are any active (in progress or suspended) games
  hasActiveGames(): boolean {
    return this.activeGames.some(game => 
      game.status === 'IN_PROGRESS' || game.status === 'SUSPENDED'
    );
  }

  loadTeams() {
    this.api.listTeams().subscribe(teams => {
      this.teams = teams;
    });
  }

  reloadAll() {
    this.reloadGames();
    this.loadTeams();
  }

  onScoreAdjust(adjustment: { homeDelta: number, awayDelta: number }) {
    if (!this.detail?.game?.gameId) return;

    const gameId = this.detail.game.gameId;
    
    this.api.adjustScore(gameId, adjustment.homeDelta, adjustment.awayDelta).subscribe({
      next: () => {
        // Update local state to reflect the change
        if (this.detail?.game) {
          this.detail.game.homeScore += adjustment.homeDelta;
          this.detail.game.awayScore += adjustment.awayDelta;
        }
        // Also update the game in the games list
        const gameIndex = this.games.findIndex(g => g.gameId === gameId);
        if (gameIndex !== -1) {
          this.games[gameIndex].homeScore += adjustment.homeDelta;
          this.games[gameIndex].awayScore += adjustment.awayDelta;
        }
        
        // Update active games if needed
        const activeIndex = this.activeGames.findIndex(g => g.gameId === gameId);
        if (activeIndex !== -1) {
          this.activeGames[activeIndex] = { 
            ...this.activeGames[activeIndex], 
            homeScore: this.games[gameIndex].homeScore,
            awayScore: this.games[gameIndex].awayScore
          };
        }
        
        console.log('Puntuación ajustada correctamente');
      },
      error: (error) => {
        console.error('Error ajustando puntuación:', error);
        // Aquí podrías mostrar un mensaje de error al usuario
      }
    });
  }

  reloadGames() {
    this.api.listGames().subscribe((g) => {
      this.games = g;
      // Incluir partidos en progreso, suspendidos y programados en la lista de activos
      this.activeGames = g.filter((game) => 
        game.status === 'IN_PROGRESS' || game.status === 'SUSPENDED' || game.status === 'SCHEDULED'
      );
    });
  }

  view(id: number) {
    this.selectedGameId = id;
    this.api.getGame(id).subscribe({
      next: (d) => {
        this.detail = d;
        // Asegurarse de que el partido esté en la lista de juegos activos
        if (!this.activeGames.some(g => g.gameId === id)) {
          this.reloadGames();
        }
      },
      error: (err) => {
        console.error('Error cargando partido:', err);
        alert('No se pudo cargar el partido. Intente nuevamente.');
      }
    });
  }

  createGame(homeTeamId: number, awayTeamId: number) {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;
    this.creating = true;
    this.api.pairGame(homeTeamId, awayTeamId).subscribe({
      next: ({ gameId }) => {
        // Recargamos la lista de juegos
        this.reloadGames();
        // Cargamos el detalle del nuevo partido
        this.view(gameId);
      },
      error: (err) => {
        console.error('Error creando partido:', err);
        alert('Error al crear el partido. Por favor, intente nuevamente.');
      },
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
    const g = this.detail?.game;
    if (!g || this.advancing || g.status !== 'IN_PROGRESS') return;

    // Si por alguna razón llega sin auto-advance activado, no hagas nada
    if (!this.autoAdvanceEnabled) return;

    const tied = g.homeScore === g.awayScore;

    const doAdvance = (label: string, fromQ: number, toQ: number) => {
      this.advancing = true;
      this.api.advance(g.gameId).subscribe({
        next: () => {
          this.view(g.gameId); // refresca detalle
          this.notify.showInfo(label, `Se avanzó a ${toQ <= 4 ? `Q${toQ}` : `T.E. ${toQ - 4}`}`, 2200);
          this.sound.play('click');
          this.notify.triggerQuarterEndFlash?.();
        },
        error: (err) => {
          console.error('Error auto-advance:', err);
          this.notify.showError('Error', 'No se pudo avanzar automáticamente', true);
          this.sound.play('error');
          this.advancing = false; // Asegurar que se pueda reintentar
        },
        complete: () => (this.advancing = false),
      });
    };

    // --- Reglas ---
    if (g.quarter < 4) {
      // Q1–Q3 → avanza al siguiente cuarto
      doAdvance('Fin de cuarto', g.quarter, g.quarter + 1);
      return;
    }

    if (g.quarter === 4) {
      // Q4: si hay empate → crear T.E. (Q5); si no, NO avanzar
      if (tied) {
        doAdvance('Fin del 4º • Iniciando T.E.', 4, 5);
      }
      return;
    }

    if (g.quarter >= 5) {
      // En T.E.: si sigue empatado → otro T.E.; si no, no avanzar (queda definido)
      if (tied) {
        doAdvance('Fin de T.E. • Nuevo T.E.', g.quarter, g.quarter + 1);
      }
      return;
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

  // Maneja el evento de reinicio solicitado desde el panel de control
  onResetRequested() {
    if (this.detail) {
      // Recargar el juego después de reiniciar
      this.view(this.detail.game.gameId);
      // Recargar también la lista de juegos
      this.reloadGames();
    }
  }
}