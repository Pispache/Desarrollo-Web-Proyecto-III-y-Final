import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';

import {
  ApiService,
  Game,
  GameDetail,
  Player,
  FoulSummary,
  FoulType
} from '../services/api.service';

import {
  TeamFoulsPipe,
  PlayerFoulsTotalPipe,
  IsBonusPipe,
  PlayerFoulsQPipe
} from './ui.pipes';

type Side = 'HOME' | 'AWAY';

@Component({
  selector: 'app-results-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TeamFoulsPipe,
    PlayerFoulsTotalPipe,
    IsBonusPipe,
    PlayerFoulsQPipe,
  ],
  templateUrl: './results-page.component.html',
})
export class ResultsPageComponent {
  // ===== Estado de filtros
  q = '';
  statusFilter: 'ALL' | 'FINISHED' | 'IN_PROGRESS' | 'SCHEDULED' = 'FINISHED';

  // ===== Datos
  games: Game[] = [];
  filtered: Game[] = [];
  selected: GameDetail | null = null;
  homeRoster: Player[] = [];
  awayRoster: Player[] = [];
  foulSummary: FoulSummary | null = null;

  // Jugadores fuera por 5 faltas o descalificación
  outSet = new Set<number>();

  // Iteraciones en template
  readonly foulTypes: FoulType[] = ['PERSONAL', 'TECHNICAL', 'UNSPORTSMANLIKE', 'DISQUALIFYING'];
  readonly quarters: number[] = [1, 2, 3, 4];

  // Toggles de detalle
  showHomeDetail = false;
  showAwayDetail = false;

  // ===== Índices precalculados =====
  // Equipo: (side|quarter|type) -> count
  private teamIndexQType = new Map<string, number>();
  // Jugador: (side|playerId|quarter|type) -> count
  private pfIndexQType = new Map<string, number>();
  // Jugador total por tipo: (side|playerId|type) -> count
  private pfIndexTypeTotal = new Map<string, number>();

  constructor(private api: ApiService, private route: ActivatedRoute) {
    this.reload();

    // Carga directa si viene ?id=...
    const idParam = this.route.snapshot.queryParamMap.get('id');
    const id = idParam ? Number(idParam) : NaN;
    if (!Number.isNaN(id)) {
      this.api.getGame(id).subscribe((d) => {
        this.selected = d;
        this.loadAuxFor(d.game.gameId);
      });
    }
  }

  // ================== Listado + filtros ==================
  reload() {
    this.api.listGames().subscribe((g) => {
      this.games = g;
      this.applyFilters();
    });
  }

  applyFilters() {
    const q = this.q.trim().toLowerCase();
    this.filtered = this.games.filter((x) => {
      const okS = this.statusFilter === 'ALL' || x.status === this.statusFilter;
      const txt = `${x.homeTeam} ${x.awayTeam}`.toLowerCase();
      const okQ = !q || txt.includes(q);
      return okS && okQ;
    });
  }

  // ================== Detalle ==================
  view(game: Game | number) {
    const gameId = typeof game === 'number' ? game : game.gameId;
    forkJoin({
      detail: this.api.getGame(gameId),
      home: this.api.listGamePlayers(gameId, 'HOME'),
      away: this.api.listGamePlayers(gameId, 'AWAY'),
      summary: this.api.getFoulSummary(gameId),
    }).subscribe(({ detail, home, away, summary }) => {
      // eventos recientes primero
      detail.events = [...detail.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.selected = detail;
      this.homeRoster = home ?? [];
      this.awayRoster = away ?? [];
      this.foulSummary = summary ?? { team: [], players: [] } as any;
      this.rebuildIndexes();
      this.computeOuts();
    });
  }

  /** Auxiliar cuando ya hay selected.game (p.ej. entrada por ?id=...) */
  private loadAuxFor(gameId: number) {
    forkJoin({
      home: this.api.listGamePlayers(gameId, 'HOME'),
      away: this.api.listGamePlayers(gameId, 'AWAY'),
      summary: this.api.getFoulSummary(gameId),
    }).subscribe(({ home, away, summary }) => {
      this.homeRoster = home ?? [];
      this.awayRoster = away ?? [];
      this.foulSummary = summary ?? { team: [], players: [] } as any;
      this.rebuildIndexes();
      this.computeOuts();
    });
  }

  // ================== OUTs ==================
  /** Marca OUT por FOUL_OUT/DISQUALIFIED o por 5 acumuladas */
  private computeOuts() {
    this.outSet.clear();
    if (!this.selected) return;

    for (const e of this.selected.events) {
      if ((e.eventType === 'FOUL_OUT' || e.eventType === 'DISQUALIFIED') && e.playerId != null) {
        this.outSet.add(e.playerId);
      }
    }

    const rows = this.foulSummary?.players ?? [];
    const countByPlayer = new Map<number, number>();
    for (const r of rows as any[]) {
      const prev = countByPlayer.get(r.playerId) ?? 0;
      countByPlayer.set(r.playerId, prev + (r.fouls ?? 0));
    }
    for (const [pid, total] of countByPlayer) {
      if (total >= 5) this.outSet.add(pid);
    }
  }

  // ================== Indexación / Utilidades ==================
  private keyTeam(side: Side, q: number, t: FoulType) { return `${side}|${q}|${t}`; }
  private keyQType(side: Side, pid: number, q: number, t: FoulType) { return `${side}|${pid}|${q}|${t}`; }
  private keyType(side: Side, pid: number, t: FoulType) { return `${side}|${pid}|${t}`; }
  private inc(map: Map<string, number>, key: string, val: number) { map.set(key, (map.get(key) || 0) + (val || 0)); }
  private normType(x?: string | FoulType): FoulType { return ((x ?? 'PERSONAL') as FoulType); }
  private normSide(x: string): Side { return (x?.toUpperCase?.() === 'AWAY' ? 'AWAY' : 'HOME'); }

  /** Recalcula todos los índices cuando cambia el resumen */
  private rebuildIndexes() {
    this.teamIndexQType.clear();
    this.pfIndexQType.clear();
    this.pfIndexTypeTotal.clear();

    // Equipo
    const trows = (this.foulSummary?.team ?? []) as Array<{ team: string; quarter: number; foulType?: FoulType | string; fouls: number }>;
    for (const r of trows) {
      const side = this.normSide(r.team);
      const q = r.quarter ?? 0;
      const t = this.normType(r.foulType);
      const cnt = r.fouls ?? 0;
      this.inc(this.teamIndexQType, this.keyTeam(side, q, t), cnt);
    }

    // Jugadores
    const prows = (this.foulSummary?.players ?? []) as Array<{ team: string; playerId: number; quarter: number; foulType?: FoulType | string; fouls: number }>;
    for (const r of prows) {
      const side = this.normSide(r.team);
      const pid = r.playerId;
      const q = r.quarter ?? 0;
      const t = this.normType(r.foulType);
      const cnt = r.fouls ?? 0;
      this.inc(this.pfIndexQType, this.keyQType(side, pid, q, t), cnt);
      this.inc(this.pfIndexTypeTotal, this.keyType(side, pid, t), cnt);
    }
  }

  // ================== Equipo: helpers usados por el template ==================
  /** Conteo por equipo/tipo/cuarto */
  teamFoulsByType(side: Side, type: FoulType, quarter: number): number {
    return this.teamIndexQType.get(this.keyTeam(side, quarter, type)) ?? 0;
  }

  /** Total por cuarto (sumando todos los tipos) */
  teamFoulsAllTypesByQuarter(side: Side, q: number): number {
    return this.foulTypes.reduce((sum, t) => sum + this.teamFoulsByType(side, t, q), 0);
  }

  /** Total por tipo en Q1..Q4 */
  teamFoulsByTypeTotal(side: Side, type: FoulType): number {
    return this.quarters.reduce((sum, q) => sum + this.teamFoulsByType(side, type, q), 0);
  }

  /** Total equipo (todos los tipos, todos los cuartos) */
  teamFoulsAllTypesTotal(side: Side): number {
    return this.foulTypes.reduce((s, t) => s + this.teamFoulsByTypeTotal(side, t), 0);
  }

  // ================== Jugador: helpers usados por el template ==================
  playerFoulsByTypeQ(side: Side, pid: number, type: FoulType, quarter: number): number {
    return this.pfIndexQType.get(this.keyQType(side, pid, quarter, type)) ?? 0;
  }

  playerFoulsQuarterTotal(side: Side, pid: number, quarter: number): number {
    return this.foulTypes.reduce((s, t) => s + this.playerFoulsByTypeQ(side, pid, t, quarter), 0);
  }

  playerFoulsTotalByType(side: Side, pid: number, type: FoulType): number {
    return this.pfIndexTypeTotal.get(this.keyType(side, pid, type)) ?? 0;
  }

  playerFoulsTotalAll(side: Side, pid: number): number {
    return this.foulTypes.reduce((s, t) => s + this.playerFoulsTotalByType(side, pid, t), 0);
  }

  // ================== Faltas de equipo SIN asignar a jugador ==================
  private sumPlayersByTypeQ(side: Side, type: FoulType, q: number): number {
    const roster = side === 'HOME' ? this.homeRoster : this.awayRoster;
    let sum = 0;
    for (const p of roster) sum += this.playerFoulsByTypeQ(side, p.playerId, type, q);
    return sum;
  }

  /** team - suma(jugadores) para ese tipo y cuarto */
  unassignedByTypeQ(side: Side, type: FoulType, quarter: number): number {
    const team = this.teamFoulsByType(side, type, quarter);
    const assigned = this.sumPlayersByTypeQ(side, type, quarter);
    return Math.max(0, team - assigned);
  }

  /** Total sin asignar por cuarto (todos los tipos) */
  unassignedQuarterTotal(side: Side, q: number): number {
    return this.foulTypes.reduce((acc, t) => acc + this.unassignedByTypeQ(side, t, q), 0);
  }

  /** Total sin asignar por tipo (suma Q1..Q4) */
  unassignedTotalByType(side: Side, type: FoulType): number {
    return this.quarters.reduce((acc, q) => acc + this.unassignedByTypeQ(side, type, q), 0);
  }

  /** Total sin asignar global */
  unassignedTotalAll(side: Side): number {
    return this.foulTypes.reduce((acc, t) => acc + this.unassignedTotalByType(side, t), 0);
  }
}
