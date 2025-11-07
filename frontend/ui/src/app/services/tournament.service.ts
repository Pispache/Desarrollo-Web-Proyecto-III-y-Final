/**
 * summary:
 *   Servicio para administrar torneos por grupos.
 * remarks:
 *   - Opera sobre `/api/tournaments/default/*` (listar, crear y eliminar grupos).
 *   - Agrega y quita equipos por grupo (máximo 4 por grupo, sin duplicados).
 *   - Devuelve DTOs tipados que usan los componentes de la vista de Torneo.
 */
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { Observable, map } from 'rxjs';

export interface TournamentGroupTeamDto { teamId: number; name: string; }
export interface TournamentGroupDto { groupId: number; name: string; createdAt?: string; teams: TournamentGroupTeamDto[]; }
export interface BracketData {
  roundOf16: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
  quarterfinals: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
  semifinals: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
  final: Array<{ homeTeamId?: number | null; awayTeamId?: number | null }>;
}

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private readonly base = '/api/tournaments';
  constructor(private http: HttpClient, private auth: AuthService) {}

  listGroups(tournamentId: number): Observable<TournamentGroupDto[]> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.get<any[]>(`${this.base}/${tournamentId}/groups`, { headers }).pipe(
      map(rows => (rows || []).map(r => ({
        groupId: Number(r.groupId),
        name: String(r.name ?? ''),
        createdAt: r.createdAt,
        teams: Array.isArray(r.teams) ? r.teams.map((t: any) => ({ teamId: Number(t.teamId), name: String(t.name ?? '') })) : []
      }) as TournamentGroupDto))
    );
  }

  createGroup(tournamentId: number, name: string): Observable<{ groupId: number; name: string; }> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.post<any>(`${this.base}/${tournamentId}/groups`, { name }, { headers }).pipe(
      map(r => ({ groupId: Number(r.groupId), name: String(r.name ?? name) }))
    );
  }

  deleteGroup(tournamentId: number, groupId: number): Observable<void> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.delete<void>(`${this.base}/${tournamentId}/groups/${groupId}`, { headers });
  }

  addTeam(tournamentId: number, groupId: number, teamId: number): Observable<void> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.post<void>(`${this.base}/${tournamentId}/groups/${groupId}/teams`, { teamId }, { headers });
  }

  removeTeam(tournamentId: number, groupId: number, teamId: number): Observable<void> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.delete<void>(`${this.base}/${tournamentId}/groups/${groupId}/teams/${teamId}`, { headers });
  }

  saveGroupSchedule(tournamentId: number, groupId: number, rounds: Array<Array<{ homeTeamId: number; awayTeamId: number }>>): Observable<{ created: number }> {
    const payload = { rounds: rounds.map(r => r.map(m => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }))) };
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.post<{ created: number }>(`${this.base}/${tournamentId}/groups/${groupId}/schedule`, payload, { headers });
  }

  // ===== Bracket endpoints (SQL Server) =====
  getBracket(tournamentId: number): Observable<BracketData> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.get<BracketData>(`${this.base}/${tournamentId}/bracket`, { headers });
  }

  saveBracket(tournamentId: number, data: BracketData): Observable<{ ok: boolean }> {
    const token = this.auth.getToken();
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
    return this.http.put<{ ok: boolean }>(`${this.base}/${tournamentId}/bracket`, data, { headers });
  }
}
