/// <summary>
/// Página de solo lectura para visualizar el registro del torneo por grupos.
/// </summary>
/// <remarks>
/// - Muestra el nombre del grupo.
/// - Muestra tabla de posiciones (PJ, PTS, G, E, P).
/// - Lista resultados de partidos finalizados dentro del grupo, indicando ganador.
/// - Indica el campeón del grupo (equipo en primer lugar por PTS, luego G, luego nombre).
/// </remarks>
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService, TeamDto, Game } from '../services/api.service';
import { TournamentService, TournamentGroupDto } from '../services/tournament.service';

interface GroupTeam {
  teamId: number;
  name: string;
  g: number; // ganados
  p: number; // perdidos
  e: number; // empatados
}

interface ViewGroup {
  groupId: number;
  name: string;
  teams: GroupTeam[];
  games: Game[]; // partidos finalizados del grupo
}

@Component({
  selector: 'app-tournament-view-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './tournament-view-page.component.html',
  styleUrls: ['./tournament-view-page.component.scss']
})
export class TournamentViewPageComponent implements OnInit {
  groups: ViewGroup[] = [];
  allTeams: TeamDto[] = [];

  constructor(
    private api: ApiService,
    private tournament: TournamentService
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll() {
    this.api.listTeams().subscribe(teams => {
      this.allTeams = teams || [];
      this.tournament.listGroups().subscribe(grps => {
        const mapped = (grps || []).map(g => this.mapDto(g));
        this.groups = mapped;
        this.loadGamesAndCompute(mapped);
      });
    });
  }

  private loadGamesAndCompute(groups: ViewGroup[]) {
    this.api.listGames().subscribe(games => {
      const finished = (games || []).filter(g => g.status === 'FINISHED');
      for (const g of groups) {
        // reset stats
        for (const t of g.teams) { t.g = 0; t.p = 0; t.e = 0; }
        const ids = new Set(g.teams.map(t => t.teamId));
        // juegos del grupo (ambos equipos pertenecen al grupo)
        const gg = finished.filter(x => !!x.homeTeamId && !!x.awayTeamId && ids.has(x.homeTeamId!) && ids.has(x.awayTeamId!));
        g.games = gg;
        for (const game of gg) {
          const home = g.teams.find(t => t.teamId === game.homeTeamId);
          const away = g.teams.find(t => t.teamId === game.awayTeamId);
          if (!home || !away) continue;
          if (game.homeScore === game.awayScore) { home.e += 1; away.e += 1; }
          else if (game.homeScore! > game.awayScore!) { home.g += 1; away.p += 1; }
          else { away.g += 1; home.p += 1; }
        }
        // ordenar por PTS desc, luego G desc, luego nombre asc
        g.teams.sort((a, b) => (this.getPTS(b) - this.getPTS(a)) || (b.g - a.g) || a.name.localeCompare(b.name));
      }
      // asignar referencia para change detection
      this.groups = [...groups];
    });
  }

  private mapDto(dto: TournamentGroupDto): ViewGroup {
    return {
      groupId: dto.groupId,
      name: dto.name,
      teams: (dto.teams || []).map(t => ({ teamId: t.teamId, name: t.name, g: 0, p: 0, e: 0 })),
      games: []
    };
  }

  getPTS(team: GroupTeam) { return team.g * 3 + team.e; }

  teamNameById(teamId?: number | null): string {
    if (!teamId) return '—';
    const t = this.allTeams.find(x => x.teamId === teamId);
    return t?.name || 'Equipo';
  }

  isHomeWinner(g: Game): boolean { return (g.homeScore ?? 0) > (g.awayScore ?? 0); }
  isAwayWinner(g: Game): boolean { return (g.awayScore ?? 0) > (g.homeScore ?? 0); }
}
