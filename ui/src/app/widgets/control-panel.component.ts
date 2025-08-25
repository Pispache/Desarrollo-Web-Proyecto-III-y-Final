import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Game, Player, FoulSummary, FoulType } from '../services/api.service';
import { ClockService } from '../services/clock.service';
import { NotificationService } from '../services/notification.service';
import { SoundService } from '../services/sound.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-panel.component.html',
  styleUrls: ['./control-panel.component.scss']
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

  // ---- anti doble disparo (tap/click rápido, o requests en vuelo) ----
  private advancing = false;
  private otBusy = false;
  private finishing = false;
  private starting = false;
  private undoing = false;
  private scoring = false;
  private subtracting = false;
  private fouling = false;
  private prevBusyClear(t: 'adv'|'ot'|'fin'|'start'|'undo'|'score'|'sub'|'foul', ms=600) {
    const m: any = {
      adv: () => this.advancing = false,
      ot: () => this.otBusy = false,
      fin: () => this.finishing = false,
      start: () => this.starting = false,
      undo: () => this.undoing = false,
      score: () => this.scoring = false,
      sub: () => this.subtracting = false,
      foul: () => this.fouling = false,
    };
    setTimeout(m[t], ms);
  }

  constructor(
    private api: ApiService,
    private notify: NotificationService,
    private sound: SoundService,
    private clock: ClockService
  ) {}

  get isInProgress() {
    return this.game?.status === 'IN_PROGRESS' || this.game?.status === 'SCHEDULED' || this.isSuspended;
  }

  ngOnChanges(_: SimpleChanges): void {
    if (!this.game) return;

    this.selHomePlayerId = undefined;
    this.selAwayPlayerId = undefined;
    this.selHomeFoulType = 'PERSONAL';
    this.selAwayFoulType = 'PERSONAL';

    forkJoin({
      home: this.api.listGamePlayers(this.game.gameId, 'HOME'),
      away: this.api.listGamePlayers(this.game.gameId, 'AWAY'),
    }).subscribe(({ home, away }) => {
      this.homePlayers = home;
      this.awayPlayers = away;
    });

    this.refreshAll();
    this.sound.preloadAll();
    this.sound.unlock();
  }

  private refresh() { this.changed.emit(); }
  private refreshAll() { this.refreshFouls(); this.refreshFoulsByType(); }

  private refreshFouls() {
    if (!this.game) return;
    this.api.getFoulSummary(this.game.gameId).subscribe(s => {
      const q = this.game.quarter;
      const th = s.team.find(r => r.quarter === q && r.team === 'HOME')?.fouls ?? 0;
      const ta = s.team.find(r => r.quarter === q && r.team === 'AWAY')?.fouls ?? 0;
      this.teamFouls = { home: th, away: ta };
    });
  }

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

  disabledScore() { return this.game?.status !== 'IN_PROGRESS' || this.isSuspended; }

  async start() {
    if (this.starting) return;
    this.starting = true;
    this.sound.play('click');
    await this.sound.unlock();

    this.api.start(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.notify.showSuccess('Partido iniciado', `Quarter ${this.game.quarter} en curso`, 2200);
        this.sound.play('start');
        // Iniciar el reloj del backend para que el Display reciba running=true inmediatamente
        this.clock.start(this.game.gameId);
      },
      error: () => { this.notify.showError('Error', 'No se pudo iniciar el partido', true); this.sound.play('error'); },
      complete: () => this.prevBusyClear('start')
    });
  }

  async advance() {
    if (this.advancing) return;           // evita doble incremento por taps rápidos
    this.advancing = true;
    this.sound.play('click');
    await this.sound.unlock();

    const prevQ = this.game.quarter;
    this.api.advance(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshAll();
        this.notify.showInfo('Fin de cuarto', `Se avanzó de Q${prevQ} a Q${prevQ + 1}`, 2200);
        this.notify.triggerQuarterEndFlash();
      },
      error: () => { this.notify.showError('Error', 'No se pudo avanzar de cuarto', true); this.sound.play('error'); },
      complete: () => this.prevBusyClear('adv', 800)
    });
  }

  async previousQuarter() {
    if (this.game.status !== 'IN_PROGRESS' || this.game.quarter <= 1) return;
    if (!confirm(`¿Retroceder al cuarto ${this.game.quarter - 1}?`)) return;

    this.sound.play('click');
    await this.sound.unlock();

    this.api.previousQuarter(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshAll();
        this.notify.showInfo('Cuarto anterior', `Se retrocedió al cuarto ${this.game.quarter - 1}`, 2200);
      },
      error: (err) => {
        console.error('Error al retroceder el cuarto:', err);
        this.notify.showError('Error', err.error?.error || 'No se pudo retroceder al cuarto anterior.', true);
        this.sound.play('error');
      }
    });
  }

  async finish() {
    if (this.finishing) return;
    this.finishing = true;
    this.sound.play('click');
    await this.sound.unlock();

    this.api.finish(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshAll();
        this.notify.showSuccess('Partido finalizado', 'Se cerró el marcador', 2600);
        this.sound.play('game_end');
      },
      error: () => { this.notify.showError('Error', 'No se pudo finalizar el partido', true); this.sound.play('error'); },
      complete: () => this.prevBusyClear('fin')
    });
  }

  /** ¿Debe mostrarse el botón de Tiempo Extra? (útil en tu template) */
  canStartOvertime(): boolean {
    return this.game?.status === 'IN_PROGRESS'
        && this.game?.quarter >= 4
        && this.game?.homeScore === this.game?.awayScore;
  }

  async startOvertime() {
    if (this.otBusy) return;
    if (!this.canStartOvertime()) return;

    const isFirst = this.game.quarter === 4;
    const message = isFirst
      ? '¿Iniciar primer tiempo extra (5 minutos)?'
      : `¿Agregar tiempo extra #${this.game.quarter - 3} (5 minutos)?`;
    if (!confirm(message)) return;

    this.otBusy = true;
    this.sound.play('click');
    await this.sound.unlock();

    this.api.startOvertime(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshAll();
        this.notify.showSuccess('Tiempo extra', 'Tiempo extra iniciado correctamente', 2600);
        this.sound.play('quarter_end');
        // Si tu padre escucha esto, puede forzar un reset del reloj:
        this.resetRequested.emit();
      },
      error: (err) => {
        console.error('Error OT:', err);
        this.notify.showError('Error', 'No se pudo iniciar el tiempo extra.', true);
        this.sound.play('error');
      },
      complete: () => this.prevBusyClear('ot', 800)
    });
  }

  async undo() {
    if (this.undoing) return;
    this.undoing = true;
    this.sound.play('click');
    await this.sound.unlock();

    this.api.undo(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.refreshAll();
        this.notify.showInfo('Deshacer', 'Se revirtió la última acción', 1800);
        this.sound.play('undo');
      },
      error: (err) => {
        console.error('Error deshaciendo:', err);
        this.notify.showError('Error', 'No se pudo deshacer la última acción', true);
        this.sound.play('error');
      },
      complete: () => this.prevBusyClear('undo')
    });
  }

  async resetAll() {
    if (!confirm('¿Reiniciar TODO el partido?')) return;

    this.sound.play('click');
    await this.sound.unlock();

    this.api.resetAll(this.game.gameId).subscribe({
      next: () => {
        this.refresh();
        this.resetRequested.emit();
        this.notify.showSuccess('Reinicio completo', 'El partido se reinició', 2600);
        this.sound.play('start');
      },
      error: (err) => {
        console.error('Error reiniciando:', err);
        this.notify.showError('Error', `Error al reiniciar: ${err.message || 'desconocido'}`, true);
        this.sound.play('error');
      }
    });
  }

  async score(team: 'HOME' | 'AWAY', points: 1 | 2 | 3) {
    if (this.scoring) return;
    if (this.game.status !== 'IN_PROGRESS' && !this.isSuspended) return;

    this.scoring = true;
    this.sound.play('click');
    await this.sound.unlock();

    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;

    this.api.score(this.game.gameId, team, points, { playerId: playerId ?? undefined }).subscribe({
      next: () => {
        this.refresh();
        const teamTxt = team === 'HOME' ? 'HOME' : 'AWAY';
        this.notify.showSuccess('Anotación', `${teamTxt} sumó ${points} punto${points>1?'s':''}`, 1600);
        this.sound.play(points === 3 ? 'score3' : points === 2 ? 'score2' : 'score1');
        this.notify.triggerScoreGlow();
      },
      error: () => { this.notify.showError('Error', 'No se pudo registrar la anotación', false); this.sound.play('error'); },
      complete: () => this.prevBusyClear('score')
    });
  }

  async subtractPoint(team: 'HOME' | 'AWAY') {
    if (this.subtracting) return;
    if (this.game?.status !== 'IN_PROGRESS' && !this.isSuspended) return;

    const currentScore = team === 'HOME' ? this.game.homeScore : this.game.awayScore;
    if (currentScore <= 0) {
      await this.sound.unlock();
      this.notify.showWarning('Advertencia', 'El puntaje ya es 0.', 1500);
      this.sound.play('error');
      return;
    }

    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;

    if (!confirm(`¿Restar 1 punto al equipo ${team === 'HOME' ? 'local' : 'visitante'}?`)) return;

    this.subtracting = true;
    this.sound.play('click');
    await this.sound.unlock();

    this.api.subtractPoint(this.game.gameId, team, { playerId: playerId ?? undefined }).subscribe({
      next: () => {
        this.refresh();
        const teamTxt = team === 'HOME' ? 'HOME' : 'AWAY';
        this.notify.showInfo('Punto restado', `Se restó 1 punto a ${teamTxt}`, 1600);
        this.sound.play('undo');
      },
      error: (err) => {
        console.error('Error al restar punto:', err);
        this.notify.showError('Error', err.error?.error || 'No se pudo restar el punto.', true);
        this.sound.play('error');
      },
      complete: () => this.prevBusyClear('sub')
    });
  }

  async foul(team:'HOME'|'AWAY') {
    if (this.fouling) return;
    if (this.game?.status !== 'IN_PROGRESS') return;

    this.fouling = true;
    this.sound.play('click');
    await this.sound.unlock();

    const playerId = team === 'HOME' ? this.selHomePlayerId : this.selAwayPlayerId;
    const type     = team === 'HOME' ? this.selHomeFoulType : this.selAwayFoulType;

    this.api.foul(this.game.gameId, team, { playerId, type }).subscribe({
      next: () => {
        this.refresh();
        this.refreshAll();
        const teamTxt = team === 'HOME' ? 'HOME' : 'AWAY';
        this.notify.showWarning('Falta', `Falta marcada a favor de ${teamTxt}`, 2000);
        this.sound.play('foul');
        this.notify.triggerFoulShake();
      },
      error: () => {
        // Fallback sin tipo para no bloquear
        this.api.foul(this.game.gameId, team, { playerId }).subscribe({
          next: () => {
            this.refresh();
            this.refreshAll();
            const teamTxt = team === 'HOME' ? 'HOME' : 'AWAY';
            this.notify.showWarning('Falta', `Falta marcada a favor de ${teamTxt}`, 2000);
            this.sound.play('foul');
            this.notify.triggerFoulShake();
          },
          error: (e2) => {
            console.error('No se pudo registrar la falta:', e2);
            this.notify.showError('Error', e2?.error?.error || 'No se pudo registrar la falta.', true);
            this.sound.play('error');
          },
          complete: () => this.prevBusyClear('foul')
        });
      },
      complete: () => this.prevBusyClear('foul')
    });
  }
}
