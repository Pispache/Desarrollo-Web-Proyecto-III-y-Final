import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  // Con Nginx proxy en Docker, /api apunta al backend
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  // Juegos o Games
  listGames(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.base}/games`);
  }

  createGame(home: string, away: string): Observable<{ gameId: number }> {
    return this.http.post<{ gameId: number }>(`${this.base}/games`, { home, away });
  }

  getGame(id: number): Observable<GameDetail> {
    return this.http.get<GameDetail>(`${this.base}/games/${id}`);
  }

  // Flow / ofensiva
  start(id: number) {
    return this.http.post(`${this.base}/games/${id}/start`, {});
  }

  advance(id: number) {
    return this.http.post(`${this.base}/games/${id}/advance-quarter`, {});
  }

  finish(id: number) {
    return this.http.post(`${this.base}/games/${id}/finish`, {});
  }

  // Acciones / Actions
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
