/**
 * summary:
 *   Servicio HTTP central para consumir la API del marcador.
 * remarks:
 *   - Expone métodos tipados para juegos, equipos, jugadores y torneos.
 *   - Maneja rutas `/api/*` y notifica cambios globales (ej. `teamsChanged$`).
 *   - Se integra con el interceptor para adjuntar el token JWT automáticamente.
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export type GameStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED' | 'SUSPENDED';
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
  leagueName?: string;
  division?: string;
  timeRemaining?: number;
  homeFouls?: number;
  awayFouls?: number;
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
export interface TeamDto { teamId: number; name: string; city?: string | null; logoUrl?: string | null; createdAt: string; }

export interface Player {
  playerId: number;
  teamId: number;
  number?: number | null;
  name: string;
  position?: string | null;
  heightCm?: number | null;
  age?: number | null;
  nationality?: string | null;
  active: boolean;
  createdAt: string;
}

export interface FoulSummaryTeamRow { quarter: number; team: 'HOME'|'AWAY'|string; fouls: number;foulType?: FoulType | string; }
export interface FoulSummaryPlayerRow { quarter: number; team: 'HOME'|'AWAY'|string; playerId: number; fouls: number; }
export interface FoulSummary { team: FoulSummaryTeamRow[]; players: FoulSummaryPlayerRow[]; }

/**
 * Servicio que centraliza las llamadas HTTP a la API del marcador.
 * Proporciona operaciones de lectura (listado) y de escritura (score, foul, clock, undo).
 */
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
  private put  = <T>(url: string, body: any) => this.http.put<T>(`${this.base}${url}`, body);
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
  previousQuarter(id: number) { return this.post(`/games/${id}/previous-quarter`, {}); }
  finish(id: number) {
    return this.post(`/games/${id}/finish`, {});
  }

  cancelGame(id: number) {
    return this.http.post(`${this.base}/games/${id}/cancel`, {}, { observe: 'response' })
      .pipe(
        map(response => {
          if (response.status === 204) { // No Content
            return { success: true };
          }
          return response.body || { success: false };
        }),
        catchError(error => {
          console.error('Error en cancelGame:', error);
          return throwError(() => error);
        })
      );
  }

  suspendGame(id: number) {
    return this.post(`/games/${id}/suspend`, {});
  }

  resumeGame(id: number) {
    return this.post(`/games/${id}/resume`, {});
  }

  startOvertime(id: number) {
    return this.post(`/games/${id}/overtime`, {});
  }

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

  subtractPoint(
    id: number,
    team: 'HOME'|'AWAY',
    opts?: { playerId?: number; playerNumber?: number }
  ) {
    return this.post(`/games/${id}/subtract-point`, {
      team,
      points: 1,
      playerId: opts?.playerId ?? null,
      playerNumber: opts?.playerNumber ?? null
    });
  }
  /** Registra una falta para el equipo indicado. */
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
 /** Deshace el último evento registrado. */
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

  /**
   * Resets the entire game (scores, clock, quarter) to initial state
   * @param gameId The ID of the game to reset
   */
  resetAll(gameId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/games/${gameId}/reset-all`, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error en resetAll:', {
          status: error.status,
          statusText: error.statusText,
          error: error.error,
          url: error.url,
          headers: error.headers
        });
        return throwError(() => error);
      })
    );
  }

  /* ========= Equipos ========= */
  getTeam(id: number): Observable<TeamDto> {
    return this.get<TeamDto>(`/teams/${id}`).pipe(map(r => this.camel<TeamDto>(r)));
  }
  listTeams(): Observable<TeamDto[]> {
    return this.listTeamsPaged().pipe(
      map(p => p.items)
    );
  }

  listTeamsPaged(params?: { q?: string; city?: string; page?: number; pageSize?: number; sort?: string }): Observable<{ items: TeamDto[]; total: number; page: number; pageSize: number }>{
    const q = new URLSearchParams();
    if (params?.q) q.set('q', params.q);
    if (params?.city) q.set('city', params.city);
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    if (params?.sort) q.set('sort', params.sort);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.get<any>(`/teams${qs}`).pipe(
      map((raw: any) => {
        const arr: any[] = Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw) ? raw : []);
        const items: TeamDto[] = arr.map(r => ({
          teamId: Number(r.TeamId ?? r.teamId),
          name: (r.Name ?? r.name) as string,
          city: (r.City ?? r.city) ?? null,
          logoUrl: (r.LogoUrl ?? r.logoUrl) ?? null,
          createdAt: this.iso((r.CreatedAt ?? r.createdAt) as string),
        }));
        return {
          items,
          total: Number(raw?.total ?? items.length),
          page: Number(raw?.page ?? 1),
          pageSize: Number(raw?.pageSize ?? items.length)
        };
      })
    );
  }

  createTeam(nameOrPayload: string | { name: string }) {
    const body = typeof nameOrPayload === 'string' ? { name: nameOrPayload } : nameOrPayload;
    return this.post<any>(`/teams`, body).pipe(
      map(r => ({ teamId: Number(r.teamId ?? r.TeamId), name: r.name ?? body.name })),
      tap(() => this.teamsChanged$.next()) // notifica para refrescar selects
    );
  }

  createTeamWithLogo(fd: FormData): Observable<TeamDto> {
    return this.http.post<TeamDto>(`${this.base}/teams/form`, fd).pipe(
      map(r => this.camel<TeamDto>(r)),
      tap(() => this.teamsChanged$.next())
    );
  }

  /** Sube/actualiza el logo del equipo. Devuelve el TeamDto actualizado. */
  uploadTeamLogo(teamId: number, file: File): Observable<TeamDto> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<TeamDto>(`${this.base}/teams/${teamId}/logo`, fd).pipe(
      map(r => this.camel<TeamDto>(r)),
      tap(() => this.teamsChanged$.next())
    );
  }

  /** Actualiza equipo usando PUT para alinearse con el backend. */
  updateTeam(teamId: number, payload: Partial<{ name: string; city: string; logoUrl?: string }>) {
    // El backend espera un TeamUpsertDto (Name requerido, City/LogoUrl opcionales)
    return this.put(`/teams/${teamId}`, {
      name: payload.name,
      city: payload.city,
      logoUrl: payload.logoUrl
    }).pipe(
      tap(() => this.teamsChanged$.next())
    );
  }

  /** Elimina un equipo por su ID. */
  deleteTeam(teamId: number) {
    return this.del(`/teams/${teamId}`).pipe(
      tap(() => this.teamsChanged$.next())
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

  createPlayer(teamId: number, p: { name: string; number?: number; position?: string; heightCm?: number; age?: number; nationality?: string }) {
    return this.post<{ playerId: number }>(`/teams/${teamId}/players`, p);
  }

  updatePlayer(
    playerId: number,
    patch: Partial<{ name: string; number: number; position: string; active: boolean; heightCm: number; age: number; nationality: string }>
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
    return this.get<FoulSummary>(`/games/${id}/foul-summary`).pipe(
      map(r => this.camel<FoulSummary>(r))
    );
  }

  getGameRoster(gameId: number, team: 'HOME' | 'AWAY') {
    return this.get<Player[]>(`/games/${gameId}/roster/${team.toLowerCase()}`).pipe(
      map(players => this.camel<Player[]>(players) || [])
    );
  }

  getPlayerFouls(gameId: number) {
    return this.get<Array<{playerId: number; team: string; quarter: number; foulType: string; count: number}>>(`/games/${gameId}/player-fouls`).pipe(
      map(fouls => this.camel(fouls) || [])
    );
  }
}
