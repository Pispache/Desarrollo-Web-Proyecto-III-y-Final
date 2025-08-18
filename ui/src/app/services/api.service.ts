import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export type GameStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED';

export interface Game {
  gameId: number;
  homeTeam: string;
  awayTeam: string;
  quarter: number;
  homeScore: number;
  awayScore: number;
  status: GameStatus;
  createdAt: string; // ISO con zona para que el date pipe muestre hora local
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
    playerNumber?: number | null;
    playerId?: number | null;         // <- puede venir si ya guardas PlayerId
    createdAt: string; // ISO con zona
  }>;
}

/* ===== Equipos ===== */
export interface Team {
  teamId: number;
  name: string;
  createdAt: string; // ISO
}

/* ===== Jugadores ===== */
export interface Player {
  playerId: number;
  teamId: number;
  number?: number | null;
  name: string;
  position?: string | null;
  active: boolean;
  createdAt: string;
}

/* ===== Resumen de faltas ===== */
export interface FoulSummaryTeamRow {
  quarter: number;
  team: 'HOME' | 'AWAY' | string;
  fouls: number;
}
export interface FoulSummaryPlayerRow {
  quarter: number;
  team: 'HOME' | 'AWAY' | string;
  playerId: number;
  fouls: number;
}
export interface FoulSummary {
  team: FoulSummaryTeamRow[];
  players: FoulSummaryPlayerRow[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  // ===== util: PascalCase -> camelCase =====
  private toCamel<T>(obj: any): T {
    if (Array.isArray(obj)) return obj.map(v => this.toCamel(v)) as T;
    if (obj && typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        const ck = k.length ? k[0].toLowerCase() + k.slice(1) : k;
        out[ck] = this.toCamel(v);
      }
      return out as T;
    }
    return obj as T;
  }

  private ensureUtcIso(s?: string): string {
    if (!s) return '';
    return s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
  }

  // ========== Juegos ==========
  listGames(): Observable<Game[]> {
    return this.http.get<any[]>(`${this.base}/games`).pipe(
      map(rows => this.toCamel<any[]>(rows)),
      map(rows => rows.map(r => ({
        gameId: r.gameId as number,
        homeTeam: r.homeTeam as string,
        awayTeam: r.awayTeam as string,
        status: r.status as GameStatus,
        quarter: r.quarter as number,
        homeScore: r.homeScore as number,
        awayScore: r.awayScore as number,
        createdAt: this.ensureUtcIso(r.createdAt as string),
        // NUEVO (si vienen en la respuesta)
        homeTeamId: (r.homeTeamId ?? r.hometeamid) ?? null,
        awayTeamId: (r.awayTeamId ?? r.awayteamid) ?? null,
      } as Game)))
    );
  }


  createGame(home: string, away: string): Observable<{ gameId: number }> {
    return this.http.post<any>(`${this.base}/games`, { home, away }).pipe(
      map(r => ({ gameId: r.GameId ?? r.gameId }))
    );
  }

  getGame(id: number): Observable<GameDetail> {
    return this.http.get<any>(`${this.base}/games/${id}`).pipe(
      map(raw => {
        const game = this.toCamel<any>(raw.game);
        const events = this.toCamel<any[]>(raw.events ?? []);
        const gameFixed: Game = {
          gameId: game.gameId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          status: game.status,
          quarter: game.quarter,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          createdAt: this.ensureUtcIso(game.createdAt),
          // NUEVO (si existen)
          homeTeamId: game.homeTeamId ?? game.hometeamid ?? null,
          awayTeamId: game.awayTeamId ?? game.awayteamid ?? null,
        };
        const eventsFixed = events.map(e => ({
          ...e,
          createdAt: this.ensureUtcIso(e.createdAt),
        }));
        return { game: gameFixed, events: eventsFixed };
      })
    );
  }


  // ========== Flow ==========
  start(id: number)   { return this.http.post(`${this.base}/games/${id}/start`, {}); }
  advance(id: number) { return this.http.post(`${this.base}/games/${id}/advance-quarter`, {}); }
  finish(id: number)  { return this.http.post(`${this.base}/games/${id}/finish`, {}); }

  // ========== Acciones ==========
  score(id: number, team: 'HOME'|'AWAY', points: 1|2|3, opts?: { playerId?: number; playerNumber?: number }) {
    const body: any = { team, points, playerId: opts?.playerId ?? null, playerNumber: opts?.playerNumber ?? null };
    return this.http.post(`${this.base}/games/${id}/score`, body);
  }

  // (ACTUALIZADO) Foul acepta jugador opcional
  foul(id: number, team: 'HOME'|'AWAY', opts?: { playerId?: number; playerNumber?: number }) {
    const body: any = { team, playerId: opts?.playerId ?? null, playerNumber: opts?.playerNumber ?? null };
    return this.http.post(`${this.base}/games/${id}/foul`, body);
  }

  undo(id: number) {
    return this.http.post(`${this.base}/games/${id}/undo`, {});
  }

  /* ========== Equipos ========== */
  listTeams(): Observable<Team[]> {
    return this.http.get<any[]>(`${this.base}/teams`).pipe(
      map(rows => rows.map(r => ({
        teamId: r.TeamId ?? r.teamId,
        name: r.Name ?? r.name,
        createdAt: this.ensureUtcIso((r.CreatedAt ?? r.createdAt) as string),
      } satisfies Team)))
    );
  }

  createTeam(name: string): Observable<{ teamId: number; name: string }> {
    return this.http.post<any>(`${this.base}/teams`, { name }).pipe(
      map(r => ({ teamId: r.teamId ?? r.TeamId, name: r.name ?? name }))
    );
  }

  /* ========== Emparejar (crear juego desde IDs de equipo) ========== */
  pairGame(homeTeamId: number, awayTeamId: number): Observable<{ gameId: number }> {
    return this.http.post<any>(`${this.base}/games/pair`, { homeTeamId, awayTeamId }).pipe(
      map(r => ({ gameId: r.gameId ?? r.GameId }))
    );
  }

  /* ========== Jugadores (por equipo) ========== */
  listPlayers(teamId: number): Observable<Player[]> {
    return this.http.get<any[]>(`${this.base}/teams/${teamId}/players`).pipe(
      map(rows => this.toCamel<any[]>(rows))
    );
  }

  createPlayer(teamId: number, p: { name: string; number?: number; position?: string }) {
    return this.http.post<{ playerId: number }>(`${this.base}/teams/${teamId}/players`, p);
  }

  updatePlayer(playerId: number, patch: Partial<{ name: string; number: number; position: string; active: boolean }>) {
    return this.http.patch(`${this.base}/players/${playerId}`, patch);
  }

  deletePlayer(playerId: number) {
    return this.http.delete(`${this.base}/players/${playerId}`);
  }

  /* ========== Jugadores por juego (HOME/AWAY) ========== */
  listGamePlayers(gameId: number, side: 'HOME'|'AWAY'): Observable<Player[]> {
    return this.http
      .get<any[]>(`${this.base}/games/${gameId}/players/${side}`)
      .pipe(map(rows => this.toCamel<any[]>(rows)));
  }


  /* ========== Resumen de faltas ========== */
  getFoulSummary(id: number): Observable<FoulSummary> {
    return this.http.get<any>(`${this.base}/games/${id}/fouls/summary`)
      .pipe(map(r => this.toCamel<FoulSummary>(r)));
  }
}
