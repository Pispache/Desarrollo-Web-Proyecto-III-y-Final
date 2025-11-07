/// <summary>
/// Página para organizar torneos por grupos.
/// </summary>
/// <remarks>
/// - Crea y elimina grupos.
/// - Agrega o quita equipos (máximo 4 por grupo).
/// - Calcula una tabla simple (PJ, PTS) desde partidos finalizados.
/// </remarks>
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, TeamDto } from '../services/api.service';
import { NotificationService } from '../services/notification.service';
import { TournamentService, TournamentGroupDto } from '../services/tournament.service';
import { ReportsService, Tournament } from '../services/reports.service';
import { AuthService } from '../services/auth.service';

interface Group {
  groupId: number;
  name: string;
  teams: GroupTeam[];
}

interface GroupTeam {
  teamId: number;
  name: string;
  g: number; // ganados
  p: number; // perdidos
  e: number; // empatados
}

@Component({
  selector: 'app-tournament-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tournament-page.component.html',
  styleUrls: ['./tournament-page.component.scss']
})
export class TournamentPageComponent implements OnInit {
  groups: Group[] = [];
  newGroupName = '';
  newTournamentName = '';
  tournaments: Tournament[] = [];
  selectedTournamentId: number | null = null;
  allTeams: TeamDto[] = [];
  // seleccion por grupo: groupId -> teamId seleccionado
  selectedByGroup: Record<string, number | ''> = {};
  creatingGroup = false;
  creatingTournament = false;
  deletingGroupId: number | null = null;
  // Feature flag: true => trabajar en localStorage (sin backend) para pruebas
  private useLocal = false;

  constructor(
    private api: ApiService,
    private notify: NotificationService,
    private tournament: TournamentService,
    private reports: ReportsService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.loadSelectedTournamentFromLocal();
    this.loadTournaments();
    this.fetchGroups();
    this.fetchTeams();
    // refrescar opciones si cambian equipos globales
    this.api.teamsChanged$.subscribe(() => this.fetchTeams());
    // calcular standings iniciales
    this.refreshStandings();
    // Inicializar placeholders de llaves (knockout) + cargar de localStorage
    this.ensureKnockoutInitialized();
    this.loadKnockoutFromLocal();
  }

  // === Tournaments list & selection ===
  loadTournaments() {
    this.reports.listTournaments().subscribe(list => {
      this.tournaments = list || [];
      if (this.selectedTournamentId && !this.tournaments.some(t => t.id === this.selectedTournamentId)) {
        // selección previa ya no existe
        this.selectedTournamentId = null;
      }
      if (!this.selectedTournamentId && this.tournaments.length > 0) {
        this.onSelectTournament(this.tournaments[0].id);
      }
    });
  }

  onSelectTournament(id: number) {
    this.selectedTournamentId = id;
    try { localStorage.setItem('tournament.selectedId', String(id)); } catch {}
    // Reset and load bracket for this tournament
    this.resetKnockout();
    // Intentar cargar desde servidor; si falla, desde localStorage
    this.reports.getBracket(id).subscribe({
      next: data => this.applyBracketFrom(data),
      error: _ => this.loadKnockoutFromLocal()
    });
    this.fetchGroups(true);
  }

  private loadSelectedTournamentFromLocal() {
    try {
      const raw = localStorage.getItem('tournament.selectedId');
      if (raw) this.selectedTournamentId = Number(raw) || null;
    } catch {}
  }

  // === Tournaments (Postgres via Report Service) ===
  createTournament() {
    const name = this.newTournamentName?.trim();
    if (!name || this.creatingTournament) return;
    this.creatingTournament = true;
    this.reports.createTournament(name).subscribe({
      next: (t) => {
        this.creatingTournament = false;
        this.newTournamentName = '';
        this.notify.showSuccess('Torneo creado', `"${t.name}" ha sido creado.`);
        // actualizar lista y seleccionar
        this.tournaments = [t, ...this.tournaments.filter(x => x.id !== t.id)];
        this.onSelectTournament(t.id);
      },
      error: (err) => {
        const msg = err?.error?.detail || err?.error || 'No se pudo crear el torneo';
        this.notify.showError('Error', String(msg));
        this.creatingTournament = false;
      }
    });
  }

  // === Knockout persistence in localStorage ===
  private storageKeyFor(): string {
    const tid = this.selectedTournamentId ?? 'none';
    return `tournament.knockout.${tid}`;
  }
  onMatchChange() { this.saveKnockoutToLocal(); }
  private saveBracketDebounce?: any;
  private saveBracketToServerDebounced() {
    if (!this.selectedTournamentId) return;
    clearTimeout(this.saveBracketDebounce);
    this.saveBracketDebounce = setTimeout(() => {
      try {
        const payload = {
          roundOf16: this.knockout.roundOf16,
          quarterfinals: this.knockout.quarterfinals,
          semifinals: this.knockout.semifinals,
          final: this.knockout.final,
        };
        this.reports.saveBracket(this.selectedTournamentId!, payload).subscribe({ next: () => {}, error: () => {} });
      } catch {}
    }, 300);
  }
  private saveKnockoutToLocal() {
    try {
      localStorage.setItem(this.storageKeyFor(), JSON.stringify(this.knockout));
    } catch {}
    // También persistir en servidor de forma diferida
    this.saveBracketToServerDebounced();
  }
  private loadKnockoutFromLocal() {
    try {
      const raw = localStorage.getItem(this.storageKeyFor());
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        if (Array.isArray(data.roundOf16)) this.knockout.roundOf16 = data.roundOf16;
        if (Array.isArray(data.quarterfinals)) this.knockout.quarterfinals = data.quarterfinals;
        if (Array.isArray(data.semifinals)) this.knockout.semifinals = data.semifinals;
        if (Array.isArray(data.final)) this.knockout.final = data.final;
      }
    } catch {}
  }

  private applyBracketFrom(data: any) {
    try {
      if (!data || typeof data !== 'object') { this.ensureKnockoutInitialized(); return; }
      const coerce = (arr: any, len: number) => Array.isArray(arr) ? arr.slice(0, len).concat(new Array(Math.max(0, len - arr.length)).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null }))) : new Array(len).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null }));
      this.knockout.roundOf16 = coerce(data.roundOf16, 8);
      this.knockout.quarterfinals = coerce(data.quarterfinals, 4);
      this.knockout.semifinals = coerce(data.semifinals, 2);
      this.knockout.final = coerce(data.final, 1);
      // Sincronizar también a localStorage
      this.saveKnockoutToLocal();
    } catch {
      this.ensureKnockoutInitialized();
    }
  }

  addGroup() {
    const name = this.newGroupName?.trim();
    if (!name) return;
    if (!this.selectedTournamentId) return;
    if (this.useLocal) {
      const gid = Date.now();
      const group: Group = { groupId: gid, name, teams: [] };
      this.groups = [group, ...this.groups];
      this.newGroupName = '';
      this.saveLocal();
      this.refreshStandings();
      return;
    }
    if (this.creatingGroup) return;
    this.creatingGroup = true;
    this.tournament.createGroup(this.selectedTournamentId, name).subscribe({
      next: g => {
        this.newGroupName = '';
        this.fetchGroups(true);
        this.creatingGroup = false;
      },
      error: err => {
        let msg = err?.error?.error as string | undefined;
        const errs = err?.error?.errors as Array<{ field: string; message: string }> | undefined;
        if (!msg && Array.isArray(errs) && errs.length) {
          msg = errs.map(e => e.message).join('\n');
        }
        this.notify.showError('Error', msg || 'No se pudo crear el grupo');
        this.creatingGroup = false;
      }
    });
  }

  async removeGroup(groupId: number) {
    const ok = await this.notify.confirm('¿Deseas eliminar este grupo? Esta acción no se puede deshacer.', 'Eliminar grupo');
    if (!ok) return;
    const gid = Number(groupId);
    if (this.useLocal) {
      this.groups = this.groups.filter(g => g.groupId !== gid);
      this.saveLocal();
      this.notify.showSuccess('Grupo eliminado', 'El grupo se eliminó correctamente.');
      this.refreshStandings();
      return;
    }
    this.deletingGroupId = gid;
    this.tournament.deleteGroup(this.selectedTournamentId!, gid).subscribe({
      next: () => {
        this.deletingGroupId = null;
        this.notify.showSuccess('Grupo eliminado', 'El grupo se eliminó correctamente.');
        this.fetchGroups(true);
      },
      error: () => {
        this.deletingGroupId = null;
        this.notify.showError('Error', 'No se pudo eliminar el grupo');
      }
    });
  }

  addTeamToGroup(group: Group) {
    if ((group.teams?.length ?? 0) >= 4) {
      this.notify.showWarning('Límite de equipos', 'Cada grupo puede tener como máximo 4 equipos.');
      return;
    }
    const sel = this.selectedByGroup[String(group.groupId)];
    if (!sel && sel !== 0) return;
    const team = this.allTeams.find(t => t.teamId === Number(sel));
    if (!team) return;
    // evitar duplicados
    if (group.teams.some(t => t.teamId === team.teamId)) return;
    if (this.useLocal) {
      group.teams.push({ teamId: team.teamId, name: team.name, g: 0, p: 0, e: 0 });
      this.selectedByGroup[String(group.groupId)] = '';
      this.saveLocal();
      this.refreshStandings();
      return;
    }
    this.tournament.addTeam(this.selectedTournamentId!, group.groupId, team.teamId).subscribe({
      next: () => {
        this.selectedByGroup[String(group.groupId)] = '';
        this.fetchGroups(true);
      },
      error: (err) => {
        const msg = err?.error?.error || 'No se pudo agregar el equipo';
        this.notify.showWarning('Aviso', msg);
      }
    });
  }

  removeTeamFromGroup(group: Group, teamId: number) {
    if (this.useLocal) {
      group.teams = group.teams.filter(t => t.teamId !== teamId);
      this.saveLocal();
      this.refreshStandings();
      return;
    }
    this.tournament.removeTeam(this.selectedTournamentId!, group.groupId, teamId).subscribe({
      next: () => this.fetchGroups(true),
      error: () => this.notify.showError('Error', 'No se pudo quitar el equipo')
    });
  }

  // actualizar estadística; kind in {'g','p','e'}; delta in {+1,-1}
  updateStat(team: GroupTeam, kind: 'g'|'p'|'e', delta: 1|-1) {
    if (kind === 'g') team.g = Math.max(0, team.g + delta);
    if (kind === 'p') team.p = Math.max(0, team.p + delta);
    if (kind === 'e') team.e = Math.max(0, team.e + delta);
    // stats se calculan desde juegos; no persistimos manualmente
  }

  getPJ(team: GroupTeam) { return team.g + team.p + team.e; }
 
  // Puntos totales en el grupo: 3 por victoria, 1 por empate, 0 por derrota
  getPTS(team: GroupTeam) { return team.g * 3 + team.e; }

  availableTeams(group: Group): TeamDto[] {
    if ((group.teams?.length ?? 0) >= 4) return [];
    // Excluir equipos ya asignados en cualquier grupo del torneo activo
    const usedInTournament = new Set<number>();
    for (const g of this.groups) {
      for (const t of g.teams) usedInTournament.add(t.teamId);
    }
    return this.allTeams.filter(t => !usedInTournament.has(t.teamId));
  }

  private fetchGroups(andRefresh = false) {
    if (this.useLocal) {
      this.loadLocal();
      if (andRefresh) this.refreshStandings();
      return;
    }
    if (!this.selectedTournamentId) { this.groups = []; return; }
    this.tournament.listGroups(this.selectedTournamentId).subscribe(list => {
      this.groups = list.map(dto => this.mapDto(dto));
      if (andRefresh) this.refreshStandings();
    });
  }

  private fetchTeams() {
    this.api.listTeams().subscribe(list => {
      this.allTeams = list;
    });
  }

  // ====== Logo helpers ======
  getTeamLogo(teamId: number | null | undefined): string | null {
    if (!teamId) return null;
    const t = this.allTeams.find(x => x.teamId === teamId);
    return (t?.logoUrl && t.logoUrl.trim() !== '') ? t.logoUrl : null;
  }

  teamNameById(teamId: number | null | undefined): string {
    if (!teamId) return 'Por definir';
    const t = this.allTeams.find(x => x.teamId === teamId);
    return t?.name ?? 'Equipo';
  }

  // ====== Knockout stages (UI scaffolding) ======
  // Simple placeholder structures to render brackets for Octavos, Cuartos, Semifinal y Final.
  knockout = {
    roundOf16: [] as Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>,
    quarterfinals: [] as Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>,
    semifinals: [] as Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>,
    final: [] as Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>,
  };

  // Initialize default bracket placeholders (8, 4, 2, 1 matches)
  private ensureKnockoutInitialized() {
    if (this.knockout.roundOf16.length === 0) this.knockout.roundOf16 = new Array(8).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null }));
    if (this.knockout.quarterfinals.length === 0) this.knockout.quarterfinals = new Array(4).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null }));
    if (this.knockout.semifinals.length === 0) this.knockout.semifinals = new Array(2).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null }));
    if (this.knockout.final.length === 0) this.knockout.final = new Array(1).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null }));
  }

  private resetKnockout() {
    this.knockout = {
      roundOf16: new Array(8).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null })),
      quarterfinals: new Array(4).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null })),
      semifinals: new Array(2).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null })),
      final: new Array(1).fill(0).map(() => ({ homeTeamId: null, awayTeamId: null })),
    };
  }

  // ====== Bracket helpers: advance winners ======
  advanceFromRound(round: 'roundOf16' | 'quarterfinals' | 'semifinals', matchIndex: number, winner: 'home' | 'away') {
    const source = this.knockout[round] as Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
    const srcMatch = source[matchIndex];
    if (!srcMatch) return;
    const winnerId = winner === 'home' ? srcMatch.homeTeamId ?? null : srcMatch.awayTeamId ?? null;
    if (!winnerId) return;

    if (round === 'roundOf16') {
      // Mapping: (0,1)->QF0; (2,3)->QF1; (4,5)->QF2; (6,7)->QF3
      const qfIndex = Math.floor(matchIndex / 2);
      const isHome = matchIndex % 2 === 0; // even -> home, odd -> away
      this.setSlot('quarterfinals', qfIndex, isHome ? 'home' : 'away', winnerId);
      // Clear downstream from quarterfinals slot if both sides not set yet will be handled naturally
    } else if (round === 'quarterfinals') {
      // Mapping: (0,1)->SF0; (2,3)->SF1
      const sfIndex = Math.floor(matchIndex / 2);
      const isHome = matchIndex % 2 === 0;
      this.setSlot('semifinals', sfIndex, isHome ? 'home' : 'away', winnerId);
    } else if (round === 'semifinals') {
      // Mapping: (0,1)->Final0
      const isHome = matchIndex % 2 === 0;
      this.setSlot('final', 0, isHome ? 'home' : 'away', winnerId);
    }
    this.saveKnockoutToLocal();
  }

  private setSlot(targetRound: 'quarterfinals' | 'semifinals' | 'final', matchIndex: number, side: 'home' | 'away', teamId: number) {
    const target = this.knockout[targetRound] as Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
    const match = target[matchIndex];
    if (!match) return;
    if (side === 'home') match.homeTeamId = teamId; else match.awayTeamId = teamId;

    // When overwriting an upstream winner, clear deeper rounds that depended on this slot
    this.clearDownstream(targetRound, matchIndex);
    this.saveKnockoutToLocal();
  }

  private clearDownstream(fromRound: 'quarterfinals' | 'semifinals' | 'final', matchIndex: number) {
    if (fromRound === 'quarterfinals') {
      const sfIndex = Math.floor(matchIndex / 2);
      const sfMatch = this.knockout.semifinals[sfIndex];
      if (sfMatch) { sfMatch.homeTeamId = sfMatch.homeTeamId; sfMatch.awayTeamId = sfMatch.awayTeamId; }
      // Clear final slot that may depend on semifinals
      const final = this.knockout.final[0];
      if (final) { final.homeTeamId = final.homeTeamId; final.awayTeamId = final.awayTeamId; }
    } else if (fromRound === 'semifinals') {
      const final = this.knockout.final[0];
      if (final) { final.homeTeamId = final.homeTeamId; final.awayTeamId = final.awayTeamId; }
    }
  }

  // For UI selects
  allTeamsForSelect(): TeamDto[] { return this.allTeams || []; }

  // Equipos ya usados en el bracket (todas las fases)
  private usedTeamIdsInBracket(): Set<number> {
    const used = new Set<number>();
    const push = (id?: number | null) => { if (typeof id === 'number' && !isNaN(id)) used.add(id); };
    const scan = (arr: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }> | undefined) => {
      if (!Array.isArray(arr)) return;
      for (const m of arr) { push(m?.homeTeamId ?? null); push(m?.awayTeamId ?? null); }
    };
    scan(this.knockout.roundOf16);
    scan(this.knockout.quarterfinals);
    scan(this.knockout.semifinals);
    scan(this.knockout.final);
    return used;
  }

  // Opciones para selects del bracket: excluye ya usados salvo el seleccionado actualmente; y opcionalmente excluye disallowId (lado contrario del mismo partido)
  bracketTeamsOptions(currentId?: number | null, disallowId?: number | null): TeamDto[] {
    const used = this.usedTeamIdsInBracket();
    // Permitir mantener el valor actual
    if (typeof currentId === 'number') used.delete(currentId);
    // Deshabilitar elegir el mismo del lado opuesto del match
    if (typeof disallowId === 'number') used.add(disallowId);
    return (this.allTeams || []).filter(t => !used.has(t.teamId));
  }

  // ====== Role helpers ======
  isAdmin(): boolean { return this.auth.isAdmin(); }

  // Recalcula automáticamente G/P/E para cada equipo del grupo usando partidos finalizados
  refreshStandings() {
    this.api.listGames().subscribe(games => {
      // Por cada grupo: reiniciar stats y luego acumular
      for (const g of this.groups) {
        const ids = new Set(g.teams.map(t => t.teamId));
        for (const t of g.teams) { t.g = 0; t.p = 0; t.e = 0; }
        for (const game of games) {
          // considerar sólo partidos finalizados con ids válidos
          if (game.status !== 'FINISHED') continue;
          const homeId = game.homeTeamId ?? undefined;
          const awayId = game.awayTeamId ?? undefined;
          if (!homeId || !awayId) continue;
          if (!ids.has(homeId) || !ids.has(awayId)) continue; // sólo si ambos están en el mismo grupo

          const home = g.teams.find(t => t.teamId === homeId)!;
          const away = g.teams.find(t => t.teamId === awayId)!;
          if (home && away) {
            if (game.homeScore === game.awayScore) {
              home.e += 1; away.e += 1;
            } else if (game.homeScore > game.awayScore) {
              home.g += 1; away.p += 1;
            } else {
              away.g += 1; home.p += 1;
            }
          }
        }
        // Ordenar la tabla por puntos (desc), luego por ganados (desc), luego por nombre
        g.teams.sort((a, b) => (this.getPTS(b) - this.getPTS(a)) || (b.g - a.g) || a.name.localeCompare(b.name));
      }
    });
  }

  private mapDto(dto: TournamentGroupDto): Group {
    return {
      groupId: dto.groupId,
      name: dto.name,
      teams: (dto.teams || []).map(t => ({ teamId: t.teamId, name: t.name, g: 0, p: 0, e: 0 }))
    };
  }

  // === Local storage helpers (modo pruebas) ===
  private saveLocal() {
    try {
      localStorage.setItem('tournament.groups', JSON.stringify(this.groups));
    } catch {}
  }
  private loadLocal() {
    try {
      const raw = localStorage.getItem('tournament.groups');
      const parsed: any[] = raw ? JSON.parse(raw) : [];
      this.groups = (parsed || []).map(g => ({
        groupId: Number(g.groupId ?? Date.now()),
        name: String(g.name ?? ''),
        teams: Array.isArray(g.teams) ? g.teams : []
      }));
    } catch {
      this.groups = [];
    }
  }
}
