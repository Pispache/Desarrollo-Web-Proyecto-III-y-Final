import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface TournamentGroupTeamDto { teamId: number; name: string; }
export interface TournamentGroupDto { groupId: number; name: string; createdAt?: string; teams: TournamentGroupTeamDto[]; }

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private readonly base = '/api/tournaments/default';
  constructor(private http: HttpClient) {}

  listGroups(): Observable<TournamentGroupDto[]> {
    return this.http.get<any[]>(`${this.base}/groups`).pipe(
      map(rows => (rows || []).map(r => ({
        groupId: Number(r.groupId),
        name: String(r.name ?? ''),
        createdAt: r.createdAt,
        teams: Array.isArray(r.teams) ? r.teams.map((t: any) => ({ teamId: Number(t.teamId), name: String(t.name ?? '') })) : []
      }) as TournamentGroupDto))
    );
  }

  createGroup(name: string): Observable<{ groupId: number; name: string; }> {
    return this.http.post<any>(`${this.base}/groups`, { name }).pipe(
      map(r => ({ groupId: Number(r.groupId), name: String(r.name ?? name) }))
    );
  }

  deleteGroup(groupId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/groups/${groupId}`);
  }

  addTeam(groupId: number, teamId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/groups/${groupId}/teams`, { teamId });
  }

  removeTeam(groupId: number, teamId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/groups/${groupId}/teams/${teamId}`);
  }

  saveGroupSchedule(groupId: number, rounds: Array<Array<{ homeTeamId: number; awayTeamId: number }>>): Observable<{ created: number }> {
    const payload = { rounds: rounds.map(r => r.map(m => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }))) };
    return this.http.post<{ created: number }>(`${this.base}/groups/${groupId}/schedule`, payload);
  }
}
