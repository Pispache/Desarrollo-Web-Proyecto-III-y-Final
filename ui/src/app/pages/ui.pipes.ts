import { Pipe, PipeTransform } from '@angular/core';

// Aceptamos 'HOME'|'AWAY' o string (por compatibilidad con FoulSummary del ApiService)
type TeamKey = 'HOME' | 'AWAY';
type MaybeTeam = TeamKey | string;

export interface TeamAggLike { quarter: number; team: MaybeTeam; fouls: number; }
export interface PlayerAggLike { quarter: number; team: MaybeTeam; playerId: number; fouls: number; }

// Guard utilitario
function toTeamKey(x: MaybeTeam): TeamKey | null {
  const t = (x ?? '').toString().toUpperCase();
  return t === 'HOME' ? 'HOME' : t === 'AWAY' ? 'AWAY' : null;
}

@Pipe({ name: 'teamFouls', standalone: true })
export class TeamFoulsPipe implements PipeTransform {
  transform(teamAgg: TeamAggLike[] | null | undefined, team: TeamKey, quarter?: number): number {
    if (!teamAgg?.length) return 0;
    return teamAgg
      .filter(r => toTeamKey(r.team) === team && (quarter ? r.quarter === quarter : true))
      .reduce((acc, r) => acc + (r.fouls ?? 0), 0);
  }
}

@Pipe({ name: 'isBonus', standalone: true })
export class IsBonusPipe implements PipeTransform {
  transform(teamAgg: TeamAggLike[] | null | undefined, team: TeamKey, quarter: number): boolean {
    if (!teamAgg?.length) return false;
    const fouls = teamAgg
      .filter(r => toTeamKey(r.team) === team && r.quarter === quarter)
      .reduce((a, r) => a + (r.fouls ?? 0), 0);
    return fouls >= 5; // Regla FIBA
  }
}

@Pipe({ name: 'playerFoulsTotal', standalone: true })
export class PlayerFoulsTotalPipe implements PipeTransform {
  transform(playerAgg: PlayerAggLike[] | null | undefined, team: TeamKey, playerId: number): number {
    if (!playerAgg?.length) return 0;
    return playerAgg
      .filter(r => toTeamKey(r.team) === team && r.playerId === playerId)
      .reduce((a, r) => a + (r.fouls ?? 0), 0);
  }
  
}

@Pipe({ name: 'playerFoulsQ', standalone: true })
export class PlayerFoulsQPipe implements PipeTransform {
  /**
   * Devuelve la cantidad de faltas de un jugador en un cuarto específico.
   */
  transform(
    playerAgg: PlayerAggLike[] | null | undefined,
    team: TeamKey,
    playerId: number,
    quarter: number
  ): number {
    if (!playerAgg?.length) return 0;
    return playerAgg
      .filter(r => toTeamKey(r.team) === team && r.playerId === playerId && r.quarter === quarter)
      .reduce((a, r) => a + (r.fouls ?? 0), 0);
  }
}

