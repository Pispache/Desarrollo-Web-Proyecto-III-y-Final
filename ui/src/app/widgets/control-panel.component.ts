import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Game, FoulType, Player } from '../services/api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-panel.component.html',
})
export class ControlPanelComponent implements OnChanges {
  @Input({ required: true }) game!: Game;
  @Input() isSuspended: boolean = false;
  @Output() changed = new EventEmitter<void>();
  @Output() resetRequested = new EventEmitter<void>();

  homePlayers: Player[] = [];
  awayPlayers: Player[] = [];

  selHomePlayerId?: number;
  selAwayPlayerId?: number;

  selHomeFoulType: FoulType = 'PERSONAL';
  selAwayFoulType: FoulType = 'PERSONAL';

  teamFouls = { home: 0, away: 0 };

  breakdown: {
    home: Record<FoulType, number>,
    away: Record<FoulType, number>
  } = {
    home: { PERSONAL: 0, TECHNICAL: 0, UNSPORTSMANLIKE: 0, DISQUALIFYING: 0 },
    away: { PERSONAL: 0, TECHNICAL: 0, UNSPORTSMANLIKE: 0, DISQUALIFYING: 0 },
  };

  private readonly FOUL_TYPES: readonly FoulType[] =
    ['PERSONAL','TECHNICAL','UNSPORTSMANLIKE','DISQUALIFYING'] as const;

  constructor(private api: ApiService) {}

  get isInProgress() { return this.game?.status === 'IN_PROGRESS' || this.game?.status === 'SCHEDULED' || this.isSuspended; }

  ngOnChanges(_: SimpleChanges) {
    if (!this.game) return;

    // Reset selecciones al cambiar de partido
    this.selHomePlayerId = undefined;
    this.selAwayPlayerId = undefined;
    this.selHomeFoulType = 'PERSONAL';
    this.selAwayFoulType = 'PERSONAL';

    // Cargar plantillas en paralelo
    forkJoin({
      home: this.api.listGamePlayers(this.game.gameId, 'HOME'),
      away: this.api.listGamePlayers(this.game.gameId, 'AWAY'),
    }).subscribe(({ home, away }) => {
      this.homePlayers = home;
      this.awayPlayers = away;
    });

    this.refreshAll();
  }

  private refresh() { this.changed.emit(); }

  private refreshAll() {
    this.refreshFouls();
    this.refreshFoulsByType();
  }

  private refreshFouls() {
    if (!this.game) return;
    this.api.getFoulSummary(this.game.gameId).subscribe(s => {
      const q = this.game.quarter;
      const th = s.team.find(r => r.quarter === q && r.team === 'HOME')?.fouls ?? 0;
      const ta = s.team.find(r => r.quarter === q && r.team === 'AWAY')?.fouls ?? 0;
      this.teamFouls = { home: th, away: ta };
    });
  }

  // Desglose por tipo usando los eventos del juego (cuarto actual)
  private refreshFoulsByType() {
    if (!this.game) return;
    const zero = (): Record<FoulType, number> =>
      ({ PERSONAL: 0, TECHNICAL: 0, UNSPORTSMANLIKE: 0, DISQUALIFYING: 0 });

    this.api.getGame(this.game.gameId).subscribe(detail => {
      const q = this.game.quarter;
      const home = zero(), away = zero();

      for (const e of detail.events ?? []) {
        if (e.eventType !== 'FOUL' || e.quarter !== q) continue;
        const t = this.FOUL_TYPES.includes(e.foulType as FoulType)
          ? (e.foulType as FoulType)
          : 'PERSONAL';
        (e.team === 'HOME' ? home : away)[t] += 1;
      }

      this.breakdown = { home, away };
    });
  }

  start()   { this.api.start(this.game.gameId).subscribe(() => this.refresh()); }
  advance() { this.api.advance(this.game.gameId).subscribe(() => { this.refresh(); this.refreshAll(); }); }
  finish()  { this.api.finish(this.game.gameId).subscribe(() => { this.refresh(); this.refreshAll(); }); }

  /**
   * Inicia o agrega un tiempo extra al partido
   * Maneja tanto el primer tiempo extra como los adicionales
   */
  startOvertime() {
    if (this.game.status !== 'IN_PROGRESS' || this.game.homeScore !== this.game.awayScore) {
      return;
    }
    
    // Mostrar confirmación para el primer tiempo extra
    const isFirstOvertime = this.game.quarter === 4;
    const message = isFirstOvertime 
      ? '¿Iniciar primer tiempo extra (5 minutos)?'
      : `¿Agregar tiempo extra #${this.game.quarter - 3} (5 minutos)?`;
    
    if (!confirm(message)) {
      return;
    }
    
    this.api.startOvertime(this.game.gameId).subscribe({
      next: () => {
        console.log('Tiempo extra iniciado exitosamente');
        this.refresh();
        this.refreshAll();
      },
      error: (err) => {
        console.error('Error iniciando tiempo extra:', err);
        alert('No se pudo iniciar el tiempo extra. Por favor, intente nuevamente.');
      }
    });
  }
  undo() {
    this.api.undo(this.game.gameId).subscribe({
      next: () => this.changed.emit(),
      error: (err) => console.error('Error deshaciendo:', err)
    });
  }

  resetAll() {
    if (confirm('¿Estás seguro de que deseas reiniciar TODO el partido? Se reiniciará el marcador, el tiempo y el cuarto actual.')) {
      console.log('Iniciando reinicio completo del partido...');
      this.api.resetAll(this.game.gameId).subscribe({
        next: () => {
          console.log('Reinicio completado exitosamente');
          this.changed.emit();
          this.resetRequested.emit();
        },
        error: (err) => {
          console.error('Error reiniciando el partido:', err);
          alert(`Error al reiniciar el partido: ${err.message || 'Error desconocido'}`);
          if (err.error) {
            console.error('Detalles del error:', err.error);
            if (err.error.errors) {
              console.error('Errores de validación:', err.error.errors);
            }
          }
        }
      });
    }
  }

  score(team: 'HOME' | 'AWAY', points: 1 | 2 | 3) {
    if (this.game.status !== 'IN_PROGRESS' && !this.isSuspended) return;
    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    this.api.score(
      this.game.gameId, 
      team, 
      points, 
      { playerId: playerId ?? undefined }
    ).subscribe(() => this.refresh());
  }

  subtractPoint(team: 'HOME' | 'AWAY') {
    if (this.game?.status !== 'IN_PROGRESS' && !this.isSuspended) return;
    
    // Prevent going below 0
    const currentScore = team === 'HOME' ? this.game.homeScore : this.game.awayScore;
    if (currentScore <= 0) {
      alert('El puntaje ya es 0.');
      return;
    }

    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    
    if (confirm(`¿Restar 1 punto al equipo ${team === 'HOME' ? 'local' : 'visitante'}?`)) {
      this.api.subtractPoint(
        this.game.gameId,
        team,
        { playerId: playerId ?? undefined }
      ).subscribe({
        next: () => this.refresh(),
        error: (err) => {
          console.error('Error al restar punto:', err);
          alert(err.error?.error || 'No se pudo restar el punto.');
        }
      });
    }
  }

  foul(team:'HOME'|'AWAY') {
    if (this.game?.status !== 'IN_PROGRESS') return;
    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    const type     = team === 'HOME' ? this.selHomeFoulType : this.selAwayFoulType;

    this.api.foul(this.game.gameId, team, { playerId, type }).subscribe({
      next: () => { this.refresh(); this.refreshFouls(); this.refreshFoulsByType(); },
      error: () => {
        // Fallback: registra sin tipo para no bloquear el flujo
        this.api.foul(this.game.gameId, team, { playerId }).subscribe({
          next: () => { this.refresh(); this.refreshFouls(); this.refreshFoulsByType(); },
          error: (e2) => {
            console.error('No se pudo registrar la falta:', e2);
            alert(e2?.error?.error || 'No se pudo registrar la falta.');
          }
        });
      }
    });
  }

}
