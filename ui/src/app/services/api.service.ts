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
  createdAt: string;
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
    createdAt: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  /** Convierte claves PascalCase -> camelCase */
  private camelize(obj: any): any {
    if (Array.isArray(obj)) return obj.map(v => this.camelize(v));
    if (obj && typeof obj === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) {
        const ck = k.length ? k[0].toLowerCase() + k.slice(1) : k;
        out[ck] = this.camelize(v);
      }
      return out;
    }
    return obj;
  }

  // ========== Juegos ==========
  listGames(): Observable<Game[]> {
    return this.http.get<any[]>(`${this.base}/games`).pipe(
      map(rows => this.camelize(rows) as Game[])
    );
  }

  createGame(home: string, away: string): Observable<{ gameId: number }> {
    return this.http.post<any>(`${this.base}/games`, { home, away }).pipe(
      // soporta {GameId: n} o {gameId: n}
      map(r => ({ gameId: r.GameId ?? r.gameId }))
    );
  }

  getGame(id: number): Observable<GameDetail> {
    return this.http.get<any>(`${this.base}/games/${id}`).pipe(
      map(raw => {
        const game   = this.camelize(raw.game)   as Game;
        const events = this.camelize(raw.events) as GameDetail['events'];
        return { game, events };
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
}
