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
    createdAt: string; // ISO con zona
  }>;
}

/* ===== NUEVO: tipos de equipos ===== */
export interface Team {
  teamId: number;
  name: string;
  createdAt: string; // ISO
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
      } satisfies Game)))
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
  score(id: number, team: 'HOME'|'AWAY', points: 1|2|3) {
    return this.http.post(`${this.base}/games/${id}/score`, { team, points });
  }
  foul(id: number, team: 'HOME'|'AWAY') {
    return this.http.post(`${this.base}/games/${id}/foul`, { team });
  }
  undo(id: number) {
    return this.http.post(`${this.base}/games/${id}/undo`, {});
  }

  /* ========== NUEVO: Equipos ========== */
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

  /* ========== NUEVO: Emparejar (crear juego desde IDs de equipo) ========== */
  pairGame(homeTeamId: number, awayTeamId: number): Observable<{ gameId: number }> {
    return this.http.post<any>(`${this.base}/games/pair`, { homeTeamId, awayTeamId }).pipe(
      map(r => ({ gameId: r.gameId ?? r.GameId }))
    );
  }
}
