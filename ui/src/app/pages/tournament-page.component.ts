import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, TeamDto } from '../services/api.service';
import { NotificationService } from '../services/notification.service';
import { TournamentService, TournamentGroupDto } from '../services/tournament.service';

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
  allTeams: TeamDto[] = [];
  // seleccion por grupo: groupId -> teamId seleccionado
  selectedByGroup: Record<string, number | ''> = {};
  creatingGroup = false;
  deletingGroupId: number | null = null;
  // Feature flag: true => trabajar en localStorage (sin backend) para pruebas
  private useLocal = false;

  constructor(
    private api: ApiService,
    private notify: NotificationService,
    private tournament: TournamentService
  ) {}

  ngOnInit(): void {
    this.fetchGroups();
    this.fetchTeams();
    // refrescar opciones si cambian equipos globales
    this.api.teamsChanged$.subscribe(() => this.fetchTeams());
    // calcular standings iniciales
    this.refreshStandings();
  }

  addGroup() {
    const name = this.newGroupName?.trim();
    if (!name) return;
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
    this.tournament.createGroup(name).subscribe({
      next: g => {
        this.newGroupName = '';
        this.fetchGroups(true);
        this.creatingGroup = false;
      },
      error: err => {
        const msg = err?.error?.error || 'No se pudo crear el grupo';
        this.notify.showError('Error', msg);
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
    this.tournament.deleteGroup(gid).subscribe({
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
    this.tournament.addTeam(group.groupId, team.teamId).subscribe({
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
    this.tournament.removeTeam(group.groupId, teamId).subscribe({
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
    const ids = new Set(group.teams.map(t => t.teamId));
    return this.allTeams.filter(t => !ids.has(t.teamId));
  }

  private fetchGroups(andRefresh = false) {
    if (this.useLocal) {
      this.loadLocal();
      if (andRefresh) this.refreshStandings();
      return;
    }
    this.tournament.listGroups().subscribe(list => {
      this.groups = list.map(dto => this.mapDto(dto));
      if (andRefresh) this.refreshStandings();
    });
  }

  private fetchTeams() {
    this.api.listTeams().subscribe(list => {
      this.allTeams = list;
    });
  }

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
