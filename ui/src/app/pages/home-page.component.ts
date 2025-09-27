import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, Game, GameDetail, TeamDto } from '../services/api.service';
import { ClockService } from '../services/clock.service';

import { NotificationService } from '../services/notification.service';
import { SoundService } from '../services/sound.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ControlPanelComponent } from '../widgets/control-panel.component';
import { ThemeToggleComponent } from '../widgets/theme-toggle.component';
import { ThemeService, AppTheme } from '../services/theme.service';
import { ClockComponent } from '../widgets/clock.component';
import { TeamRosterComponent } from '../widgets/team-roster.component';
// import { FilterPipe } from '../pipes/filter.pipe';
import { Subject, finalize } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

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
    ThemeToggleComponent
  ]
})
export class HomePageComponent implements OnInit, OnDestroy {
  // filtros / estado
  teamSearch = '';
  private teamSearch$ = new Subject<string>();
  creating = false;
  advancing = false;

  // NUEVO: nombre del equipo a crear
  newTeamName = '';
  // NUEVO: ciudad del equipo a crear
  newTeamCity = '';
  // NUEVO: archivo de logo temporal y vista previa
  newTeamLogoFile: File | null = null;
  newTeamLogoPreview: string | null = null;

  // Tema actual de la UI
  theme: AppTheme = 'dark';
  // Base de la API para recursos estáticos (logos)
  private readonly apiBase = (location.port === '4200')
    ? `${location.protocol}//${location.hostname}:8080`
    : '';

  // Resuelve URL del logo (acepta absoluta, data URI o relativa a la API)
  getLogoUrl(logoUrl?: string | null): string | null {
    if (!logoUrl) return null;
    const url = logoUrl.trim();
    if (!url) return null;
    // Si ya es absoluta o data URI, devolver tal cual
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    // Construir respecto a la base de la API si estamos en dev (4200)
    const prefix = this.apiBase || '';
    const sep = url.startsWith('/') ? '' : '/';
    return `${prefix}${sep}${url}`;
  }

  // ===== Acciones sobre equipos (editar / eliminar) =====
  onEditTeam(t: TeamDto) {
    this.editingTeamId = t.teamId;
    this.editName = t.name || '';
    this.editCity = t.city || '';
  }

  onCancelEdit() {
    this.editingTeamId = null;
    this.editName = '';
    this.editCity = '';
  }

  onSaveTeam(t: TeamDto) {
    const name = (this.editName || '').trim();
    const city = (this.editCity || '').trim();
    if (!name) { this.notify.showWarning('Validación', 'El nombre es obligatorio'); return; }
    this.saving = true;
    // Importante: enviar logoUrl actual para que el backend NO lo borre al hacer PUT
    this.api.updateTeam(t.teamId, { name, city: city || undefined, logoUrl: t.logoUrl || undefined }).subscribe({
      next: () => {
        // Actualiza lista local
        const idx = this.teams.findIndex(x => x.teamId === t.teamId);
        if (idx >= 0) {
          this.teams[idx] = { ...this.teams[idx], name, city: city || null };
          this.teamById.set(t.teamId, this.teams[idx]);
        }
        this.notify.showSuccess('Equipo actualizado', `${name}`);
        this.onCancelEdit();
      },
      error: (err) => {
        console.error('Error actualizando equipo', err);
        const msg = err?.error?.error || 'No se pudo actualizar el equipo';
        this.notify.showError('Error', msg, true);
      },
      complete: () => { this.saving = false; }
    });
  }

  async onDeleteTeam(t: TeamDto) {
    const ok = await this.notify.confirm(`¿Eliminar el equipo "${t.name}"? Esta acción no se puede deshacer.`, 'Confirmar');
    if (!ok) return;
    this.deletingId = t.teamId;
    this.api.deleteTeam(t.teamId).subscribe({
      next: () => {
        this.teams = this.teams.filter(x => x.teamId !== t.teamId);
        this.notify.showSuccess('Equipo eliminado', `${t.name}`);
        if (this.editingTeamId === t.teamId) this.onCancelEdit();
      },
      error: (err) => {
        console.error('Error eliminando equipo', err);
        const msg = err?.error?.error || 'No se pudo eliminar el equipo';
        this.notify.showError('Error', msg, true);
      },
      complete: () => { this.deletingId = null; }
    });
  }

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

  // ===== Registro de equipo: manejo de archivo/logo =====
  onTeamFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files && input.files[0];
    if (!f) { this.newTeamLogoFile = null; this.clearTeamLogoPreview(); return; }
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(f.type)) {
      this.notify.showError('Formato no soportado', 'Usa PNG/JPG/WEBP', true);
      input.value = '';
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      this.notify.showError('Archivo muy grande', 'Límite 2MB', true);
      input.value = '';
      return;
    }
    this.newTeamLogoFile = f;
    this.setTeamLogoPreview(f);
  }

  private setTeamLogoPreview(file: File) {
    this.clearTeamLogoPreview();
    this.newTeamLogoPreview = URL.createObjectURL(file);
  }

  private clearTeamLogoPreview() {
    if (this.newTeamLogoPreview) {
      URL.revokeObjectURL(this.newTeamLogoPreview);
      this.newTeamLogoPreview = null;
    }
  }

  // Toggle de tema oscuro/claro
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' as AppTheme : 'dark' as AppTheme;
    this.themeSvc.setTheme(this.theme);
  }

  // datos
  teams: TeamDto[] = [];
  teamsTop10: TeamDto[] = [];
  private teamById = new Map<number, TeamDto>();
  games: Game[] = [];
  activeGames: Game[] = [];
  detail: GameDetail | null = null;
  selectedGameId: number | null = null;
  autoAdvanceEnabled = localStorage.getItem('clock.autoAdvance') === '1';

  // Bandera para mostrar notificación de caracteres no permitidos
  showInvalidCharWarning = false;
  // Estado de edición/eliminación de equipos
  editingTeamId: number | null = null;
  editName = '';
  editCity = '';
  saving = false;
  deletingId: number | null = null;
  // Observable de autenticación para el template (getter para evitar usar this.auth antes de constructor)
  get authed$() { return this.auth.authed$; }
  
  constructor(private api: ApiService, private notify: NotificationService, private sound: SoundService, private clock: ClockService, private themeSvc: ThemeService, private auth: AuthService, private router: Router) {
    this.reloadAll();
    // Asegurar que los sonidos estén precargados para reproducir en auto-advance
    try { this.sound.preloadAll(); } catch {}
    // Aplicar tema al iniciar
    this.theme = this.themeSvc.getTheme();
    this.themeSvc.applyTheme(this.theme);

    // Refrescar datos cuando cambie autenticación (cubre el caso de abrir Home sin sesión)
    this.auth.authed$.pipe(takeUntil(this.destroy$)).subscribe(isAuthed => {
      if (isAuthed) {
        this.reloadAll();
      } else {
        // Limpiar vistas protegidas si se pierde sesión
        this.teams = [];
        this.games = [];
        this.activeGames = [];
        this.detail = null;
      }
    });

    // Cuando haya cambios en equipos (crear/editar/eliminar) refrescar listado
    this.api.teamsChanged$.pipe(takeUntil(this.destroy$)).subscribe(() => this.loadTeams());

    // Búsqueda con debounce (server-side)
    this.teamSearch$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(q => {
        this.searchTeams(q);
      });
  }

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // En caso de que la página se cargue ya autenticada
    if (this.auth.isAuthenticated()) {
      this.reloadAll();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  isAuthed(): boolean { return this.auth.isAuthenticated(); }
  isAdmin(): boolean { return this.auth.isAdmin(); }

  // Handle game status changes
  private handleStatusChange(operation: Promise<any>, successMessage: string) {
    operation.then((response) => {
      this.reloadGames();
      if (this.detail) {
        this.view(this.detail.game.gameId);
      }
      this.notify.showSuccess('Éxito', successMessage);
    }).catch(error => {
      console.error('Error en handleStatusChange:', error);
      const errorMessage = error?.error?.error || 'Ocurrió un error al actualizar el estado del partido.';
      this.notify.showError('Error', errorMessage, true);
    });
  }

  // Game status control methods
  async finishGame(gameId: number) {
    const ok = await this.notify.confirm('¿Está seguro que desea marcar este partido como finalizado?', 'Confirmar');
    if (ok) {
      this.handleStatusChange(
        this.api.finish(gameId).toPromise(),
        'Partido finalizado correctamente.'
      );
    }
  }

  async suspendGame(gameId: number) {
    const ok = await this.notify.confirm('¿Está seguro que desea suspender este partido? Podrá reanudarlo más tarde.', 'Confirmar');
    if (ok) {
      this.handleStatusChange(
        this.api.suspendGame(gameId).toPromise(),
        'Partido suspendido correctamente.'
      );
    }
  }

  async resumeGame(gameId: number) {
    this.handleStatusChange(
      this.api.resumeGame(gameId).toPromise(),
      'Partido reanudado correctamente.'
    );
  }

  async cancelGame(gameId: number) {
    const ok = await this.notify.confirm('¿Está seguro que desea cancelar este partido? Esta acción no se puede deshacer.', 'Confirmar');
    if (ok) {
      this.api.cancelGame(gameId).subscribe({
        next: () => {
          this.reloadGames();
          if (this.detail?.game.gameId === gameId) {
            this.view(gameId);
          }
          this.notify.showSuccess('Éxito', 'Partido cancelado correctamente.');
        },
        error: (error) => {
          console.error('Error al cancelar el partido:', error);
          const errorMessage = error?.error?.error || 'No se pudo cancelar el partido. Intente nuevamente.';
          this.notify.showError('Error', errorMessage, true);
        }
      });
    }
  }

  // Iniciar un partido programado
  async startGame(gameId: number) {
    const ok = await this.notify.confirm('¿Está seguro que desea iniciar este partido?', 'Confirmar');
    if (ok) {
      this.api.start(gameId).subscribe({
        next: () => {
          this.reloadGames();
          this.view(gameId);
          // Iniciar el reloj backend y notificar a los suscriptores (Display)
          this.clock.start(gameId);
          this.notify.showSuccess('Éxito', 'Partido iniciado');
        },
        error: (err: any) => {
          console.error('Error al iniciar el partido:', err);
          this.notify.showError('Error', 'No se pudo iniciar el partido. Intente nuevamente.', true);
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
    this.api.listTeams().subscribe({
      next: (teams) => {
        this.teams = teams;
        this.teamsTop10 = this.teams.slice(0, 10);
        this.teamById.clear();
        for (const tm of this.teams) this.teamById.set(tm.teamId, tm);
      },
      error: (err) => {
        // Mostrar pista si falta autenticación o hay problema de red
        const msg = err?.status === 401
          ? 'Inicia sesión para ver los equipos (401).'
          : 'No se pudieron cargar los equipos.';
        try { this.notify.showInfo('Equipos', msg, 3000); } catch {}
      }
    });
  }

  // Disparado por (ngModelChange) en el input de búsqueda
  onTeamSearchChange(q: string) {
    this.teamSearch$.next(q ?? '');
  }

  // Consulta paginada al backend
  private searchTeams(q: string) {
    const query = (q ?? '').trim();
    this.api.listTeamsPaged({ q: query, page: 1, pageSize: 20, sort: 'name_asc' }).subscribe({
      next: (p) => {
        this.teams = p.items;
        this.teamsTop10 = this.teams.slice(0, 10);
        this.teamById.clear();
        for (const tm of this.teams) this.teamById.set(tm.teamId, tm);
      },
      error: () => { /* silencioso para no molestar mientras escribe */ }
    });
  }

  trackByTeamId(index: number, t: TeamDto): number { return t.teamId; }

  // Helper: devuelve URL absoluta del logo por ID de equipo
  teamLogoById(id?: number | null): string | null {
    if (!id) return null;
    const tm = this.teamById.get(id);
    return tm ? this.getLogoUrl(tm.logoUrl) : null;
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
    this.api.listGames().subscribe((g: Game[]) => {
      this.games = g;
      // Incluir partidos en progreso, suspendidos y programados en la lista de activos
      this.activeGames = g.filter((game: Game) => 
        game.status === 'IN_PROGRESS' || game.status === 'SUSPENDED' || game.status === 'SCHEDULED'
      );
    });
  }

  view(id: number) {
    this.selectedGameId = id;
    this.api.getGame(id).subscribe({
      next: (d: GameDetail | null) => {
        if (!d) return;
        this.detail = d;
        // Scoreboard/ControlPanel gestionan el estado del reloj de forma autónoma
        // Asegurarse de que el partido esté en la lista de juegos activos
        if (!this.activeGames.some((g: Game) => g.gameId === id)) {
          this.reloadGames();
        }
      },
      error: (err: any) => {
        console.error('Error cargando partido:', err);
        alert('No se pudo cargar el partido. Intente nuevamente.');
      }
    });
  }

  createGame(homeTeamId: number, awayTeamId: number) {
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;
    this.creating = true;
    this.api.pairGame(homeTeamId, awayTeamId).subscribe({
      next: (res: any) => {
        const gameId: number | undefined = res?.gameId;
        if (!gameId) return;
        // Recargamos la lista de juegos
        this.reloadGames();
        // Cargamos el detalle del nuevo partido
        this.view(gameId);
      },
      error: (err: any) => {
        console.error('Error creando partido:', err);
        alert('Error al crear el partido. Por favor, intente nuevamente.');
      },
      complete: () => (this.creating = false),
    });
  }

  createTeam() {
    const name = this.newTeamName.trim();
    const city = this.newTeamCity.trim();
    if (!name) return;
    const fd = new FormData();
    fd.append('name', name);
    if (city) fd.append('city', city);
    if (this.newTeamLogoFile) fd.append('file', this.newTeamLogoFile);

    this.creating = true;
    this.api.createTeamWithLogo(fd).subscribe({
      next: () => {
        this.newTeamName = '';
        this.newTeamCity = '';
        this.clearTeamLogoPreview();
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
  async onResetGame() {
    const game = this.detail?.game;
    if (!game) return;
    const ok = await this.notify.confirm('¿Está seguro que desea reiniciar el juego? Se restablecerán los puntajes, faltas y el reloj.', 'Confirmar');
    if (ok) {
      this.api.resetGame(game.gameId).subscribe({
        next: () => {
          // Recargar los datos del juego después del reinicio
          this.reloadGames();
          if (this.detail) {
            this.view(this.detail.game.gameId);
          }
          this.notify.showSuccess('Éxito', 'Juego reiniciado');
        },
        error: (err) => {
          console.error('Error al reiniciar el juego:', err);
          this.notify.showError('Error', 'No se pudo reiniciar el juego', true);
        }
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
    // Validación UI ya se realiza en Scoreboard; aquí simplemente aplicamos el ajuste
    
    this.api.adjustScore(gameId, adjustment.homeDelta, adjustment.awayDelta).subscribe({
      next: () => {
        // Actualizar la vista con los nuevos puntajes
        this.view(gameId);

        // Agregar eventos sintéticos para reflejar el ajuste manual en la UI inmediatamente
        if (this.detail) {
          const nowIso = new Date().toISOString();
          const q = this.detail.game.quarter;
          if (adjustment.homeDelta) {
            this.detail.events = [
              { eventId: 0, gameId, quarter: q, team: 'HOME', eventType: 'ADJUST_SCORE', createdAt: nowIso } as any,
              ...this.detail.events
            ];
          }
          if (adjustment.awayDelta) {
            this.detail.events = [
              { eventId: 0, gameId, quarter: q, team: 'AWAY', eventType: 'ADJUST_SCORE', createdAt: nowIso } as any,
              ...this.detail.events
            ];
          }
        }
      },
      error: (err: any) => {
        console.error('Error ajustando puntuación', err);
        // Mostrar mensaje de error centralizado
        this.notify.showError('Error', 'No se pudo ajustar la puntuación. Intente nuevamente.', true);
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