import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, map, tap } from 'rxjs';

export type GameStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';
export type FoulType = 'PERSONAL' | 'TECHNICAL' | 'UNSPORTSMANLIKE' | 'DISQUALIFYING';

export interface Game {
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  quarter: number;
  homeScore: number;
  awayScore: number;
  status: GameStatus;
  createdAt: string;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}

export interface GameDetail {
  game: Game;
  events: Array<{
    eventId: number;
    gameId: number;
    quarter: number;
    team: 'HOME' | 'AWAY' | string;
    eventType: 'POINT_1' | 'POINT_2' | 'POINT_3' | 'FOUL' | 'UNDO' | string;
    /** Tipo de falta (si el backend lo devuelve) */
    foulType?: FoulType | string;
    playerNumber?: number | null;
    playerId?: number | null;
    createdAt: string;
  }>;
}

export interface Team { teamId: number; name: string; createdAt: string; }

export interface Player {
  playerId: number;
  teamId: number;
  number?: number | null;
  name: string;
  position?: string | null;
  active: boolean;
  createdAt: string;
}

export interface FoulSummaryTeamRow { quarter: number; team: 'HOME'|'AWAY'|string; fouls: number;foulType?: FoulType | string; }
export interface FoulSummaryPlayerRow { quarter: number; team: 'HOME'|'AWAY'|string; playerId: number; fouls: number; }
export interface FoulSummary { team: FoulSummaryTeamRow[]; players: FoulSummaryPlayerRow[]; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '/api';
  /** Emite cuando cambia la lista de equipos (crear/editar/eliminar). */
  readonly teamsChanged$ = new Subject<void>();

  constructor(private http: HttpClient) {}

  /* ========= Helpers compactos ========= */
  private num = (v: any) => v == null || v === '' ? null : Number(v);
  private iso = (s?: string) => !s ? '' : (s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  private camel = <T>(obj: any): T =>
    Array.isArray(obj) ? obj.map(v => this.camel(v)) as T :
    (obj && typeof obj === 'object')
      ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k[0]?.toLowerCase() + k.slice(1), this.camel(v)])) as T
      : obj as T;

  private get  = <T>(url: string) => this.http.get<T>(`${this.base}${url}`);
  private post = <T>(url: string, body: any) => this.http.post<T>(`${this.base}${url}`, body);
  private patch= <T>(url: string, body: any) => this.http.patch<T>(`${this.base}${url}`, body);
  private del  = <T>(url: string) => this.http.delete<T>(`${this.base}${url}`);

  /* ========= Juegos ========= */
  listGames(): Observable<Game[]> {
    return this.get<any[]>(`/games`).pipe(
      map(rows => this.camel<any[]>(rows).map(r => ({
        gameId: r.gameId,
        homeTeam: r.homeTeam,
        awayTeam: r.awayTeam,
        status: r.status as GameStatus,
        quarter: r.quarter,
        homeScore: r.homeScore,
        awayScore: r.awayScore,
        createdAt: this.iso(r.createdAt),
        homeTeamId: this.num(r.homeTeamId ?? r.hometeamid),
        awayTeamId: this.num(r.awayTeamId ?? r.awayteamid),
      } satisfies Game)))
    );
  }

  createGame(home: string, away: string) {
    return this.post<any>(`/games`, { home, away })
      .pipe(map(r => ({ gameId: Number(r.GameId ?? r.gameId) })));
  }

  getGame(id: number): Observable<GameDetail> {
    return this.get<any>(`/games/${id}`).pipe(
      map(raw => {
        const g = this.camel<any>(raw.game);
        const game: Game = {
          gameId: g.gameId, homeTeam: g.homeTeam, awayTeam: g.awayTeam, status: g.status,
          quarter: g.quarter, homeScore: g.homeScore, awayScore: g.awayScore, createdAt: this.iso(g.createdAt),
          homeTeamId: this.num(g.homeTeamId ?? g.hometeamid), awayTeamId: this.num(g.awayTeamId ?? g.awayteamid),
        };
        const events = (this.camel<any[]>(raw.events ?? [])).map(e => ({
          ...e,
          createdAt: this.iso(e.createdAt),
        }));
        return { game, events };
      })
    );
  }

  start(id: number)   { return this.post(`/games/${id}/start`, {}); }
  advance(id: number) { return this.post(`/games/${id}/advance-quarter`, {}); }
  finish(id: number)  { return this.post(`/games/${id}/finish`, {}); }

  score(
    id: number,
    team: 'HOME'|'AWAY',
    points: 1|2|3,
    opts?: { playerId?: number; playerNumber?: number }
  ) {
    return this.post(`/games/${id}/score`, {
      team,
      points,
      playerId: opts?.playerId ?? null,
      playerNumber: opts?.playerNumber ?? null
    });
  }

  foul(
    id: number,
    team: 'HOME'|'AWAY',
    opts?: { playerId?: number; playerNumber?: number; type?: FoulType }
  ) {
    const t = opts?.type;
    const body: any = {
      team,
      playerId: opts?.playerId ?? null,
      playerNumber: opts?.playerNumber ?? null,
      ...(t ? {
        foulType:  t,
        type:      t,
        FoulType:  t,
        foul_type: t,
      } : {})
    };
    const qs = t ? `?type=${encodeURIComponent(t)}` : '';
    return this.post(`/games/${id}/foul${qs}`, body);
  }

  undo(id: number) { return this.post(`/games/${id}/undo`, {}); }

  adjustScore(gameId: number, homeDelta: number, awayDelta: number): Observable<void> {
    return this.post(`/games/${gameId}/adjust-score`, { homeDelta, awayDelta });
  }

  /**
   * Resets the game state (scores, fouls, timer)
   * @param gameId The ID of the game to reset
   */
  resetGame(gameId: number): Observable<void> {
    return this.post(`/games/${gameId}/reset`, {});
  }

  /* ========= Equipos ========= */
  listTeams(): Observable<Team[]> {
    return this.get<any[]>(`/teams`).pipe(
      map(rows => rows.map(r => ({
        teamId: Number(r.TeamId ?? r.teamId),
        name: (r.Name ?? r.name) as string,
        createdAt: this.iso((r.CreatedAt ?? r.createdAt) as string),
      } satisfies Team)))
    );
  }

  createTeam(nameOrPayload: string | { name: string }) {
    const body = typeof nameOrPayload === 'string' ? { name: nameOrPayload } : nameOrPayload;
    return this.post<any>(`/teams`, body).pipe(
      map(r => ({ teamId: Number(r.teamId ?? r.TeamId), name: r.name ?? body.name })),
      tap(() => this.teamsChanged$.next()) // notifica para refrescar selects
    );
  }

  pairGame(homeTeamId: number, awayTeamId: number) {
    return this.post<any>(`/games/pair`, { homeTeamId, awayTeamId })
      .pipe(map(r => ({ gameId: Number(r.gameId ?? r.GameId) })));
  }

  /* ========= Jugadores ========= */
  listPlayers(teamId: number): Observable<Player[]> {
    return this.get<any[]>(`/teams/${teamId}/players`)
      .pipe(map(rows => this.camel<Player[]>(rows)));
  }

  createPlayer(teamId: number, p: { name: string; number?: number; position?: string }) {
    return this.post<{ playerId: number }>(`/teams/${teamId}/players`, p);
  }

  updatePlayer(
    playerId: number,
    patch: Partial<{ name: string; number: number; position: string; active: boolean }>
  ) {
    return this.patch(`/players/${playerId}`, patch);
  }

  deletePlayer(playerId: number) { return this.del(`/players/${playerId}`); }

  /* ========= Jugadores por juego ========= */
  listGamePlayers(gameId: number, side: 'HOME'|'AWAY') {
    return this.get<any[]>(`/games/${gameId}/players/${side}`)
      .pipe(map(rows => this.camel<Player[]>(rows)));
  }

  /* ========= Resumen de faltas ========= */
  getFoulSummary(id: number): Observable<FoulSummary> {
    return this.get<any>(`/games/${id}/fouls/summary`)
      .pipe(map(r => this.camel<FoulSummary>(r)));
  }
}
