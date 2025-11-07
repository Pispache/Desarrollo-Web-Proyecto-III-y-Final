import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface Tournament {
  id: number;
  name: string;
  created_at?: string;
}

export interface BracketData {
  roundOf16: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
  quarterfinals: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
  semifinals: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
  final: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  // Nota: durante desarrollo, el Report Service expone 8081
  private readonly base = 'http://localhost:8081/v1/reports';

  constructor(private http: HttpClient, private auth: AuthService) {}

  createTournament(name: string): Observable<Tournament> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.post<Tournament>(`${this.base}/tournaments`, { name }, { headers });
  }

  listTournaments(): Observable<Tournament[]> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.get<Tournament[]>(`${this.base}/tournaments`, { headers });
  }

  updateTournament(id: number, name: string): Observable<Tournament> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.patch<Tournament>(`${this.base}/tournaments/${id}`, { name }, { headers });
  }

  deleteTournament(id: number): Observable<void> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.delete<void>(`${this.base}/tournaments/${id}`, { headers });
  }

  getBracket(tournamentId: number): Observable<BracketData> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.get<BracketData>(`${this.base}/tournaments/${tournamentId}/bracket`, { headers });
  }

  saveBracket(tournamentId: number, data: BracketData): Observable<{ ok: boolean }> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.put<{ ok: boolean }>(`${this.base}/tournaments/${tournamentId}/bracket`, data, { headers });
  }
}
