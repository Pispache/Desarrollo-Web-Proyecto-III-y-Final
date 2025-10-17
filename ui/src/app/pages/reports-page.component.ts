import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { catchError, throwError } from 'rxjs';

interface Team {
  team_id: number;
  name: string;
  city: string;
  logo_url: string | null;
  created_at: string;
}

interface GameLite {
  game_id: number;
  home_team: string;
  away_team: string;
  created_at: string | null;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-page.component.html',
  styleUrls: ['./reports-page.component.scss']
})
export class ReportsPageComponent implements OnInit {
  // Filtros para equipos
  teamSearchQuery = '';
  teamCityFilter = '';
  teamLimit: number = 200;
  teamOffset: number = 0;
  
  // Filtros para partidos
  gamesFromDate = '';
  gamesToDate = '';
  gamesStatusFilter = '';
  gamesLimit: number = 200;
  gamesOffset: number = 0;
  
  // Filtro para jugadores
  private _selectedTeamId: number | null = null;
  players: { player_id: number; name: string; number: number | null }[] = [];
  selectedPlayerId: number | null = null;
  playerStatsManualId: number | null = null;
  statsFromDate: string = '';
  statsToDate: string = '';
  // Filtro para roster por partido
  rosterGameId: number | null = null;
  
  get selectedTeamId(): number | null {
    return this._selectedTeamId;
  }

  loadGamesList() {
    // Cargar lista de partidos desde report-service (sin filtros para selector)
    this.http.get<{ items: any[] }>(`${this.reportsBaseUrl}/games`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (response) => {
        this.games = (response.items || []).map(g => ({
          game_id: g.game_id,
          home_team: g.home_team,
          away_team: g.away_team,
          created_at: g.created_at || null,
        }));
      },
      error: (err) => {
        console.error('Error loading games list:', err);
      }
    });
  }

  downloadRosterPDF() {
    const gameId = this.selectedGameId ?? this.rosterGameId;
    if (!gameId) {
      this.error = 'Selecciona un partido o ingresa el ID de partido';
      return;
    }
    this.loading = true;
    this.error = '';
    const url = `${this.reportsBaseUrl}/games/${gameId}/roster.pdf`;
    this.http.get(url, {
      headers: this.getHeaders(),
      responseType: 'blob',
      withCredentials: true
    }).pipe(
      catchError((err: HttpErrorResponse) => {
        console.error('Error downloading roster PDF:', err);
        this.error = this.getErrorMessage(err);
        this.loading = false;
        return throwError(() => err);
      })
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `reporte-roster-partido-${gameId}-${this.getDateString()}.pdf`);
        this.loading = false;
      },
      error: () => {}
    });
  }
  
  set selectedTeamId(value: number | null) {
    console.log('[DEBUG] Team selected:', value);
    this._selectedTeamId = value;
    // Cargar jugadores del equipo para RF-REP-05
    if (value != null) {
      this.loadPlayersForTeam(value);
    } else {
      this.players = [];
      this.selectedPlayerId = null;
    }
  }
  
  teams: Team[] = [];
  games: GameLite[] = [];
  selectedGameId: number | null = null;
  
  loading = false;
  error = '';

  private get reportsBaseUrl(): string {
    return (location.port === '4200')
      ? 'http://localhost:8081/v1/reports'
      : '/reports';
  }

  private get apiBaseUrl(): string {
    return (location.port === '4200')
      ? 'http://localhost:8080/api'
      : '/api';
  }

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadTeams();
    this.loadGamesList();
  }

  onTeamChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    this.selectedTeamId = value ? parseInt(value, 10) : null;
    console.log('[DEBUG] Team changed to:', this.selectedTeamId);
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  loadTeams() {
    this.loading = true;
    this.error = '';
    
    // Cargar equipos desde la API principal (con paginación grande para obtener todos)
    this.http.get<{ items: any[], total: number }>(`${this.apiBaseUrl}/teams?pageSize=1000`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (response) => {
        this.teams = (response.items || []).map((t: any) => ({
          team_id: t.team_id ?? t.teamId ?? t.TeamId,
          name: t.name ?? t.Name,
          city: t.city ?? t.City ?? '',
          logo_url: t.logo_url ?? t.logoUrl ?? null,
          created_at: t.created_at ?? t.createdAt ?? ''
        })) as Team[];
        console.log(`Loaded ${this.teams.length} teams`, this.teams);
        if (this.teams.length > 0) {
          console.log('First team object:', this.teams[0]);
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading teams:', err);
        this.error = 'Error al cargar equipos: ' + (err.error?.detail || err.message);
        this.loading = false;
      }
    });
  }

  downloadTeamsPDF() {
    this.loading = true;
    this.error = '';
    
    let url = `${this.reportsBaseUrl}/teams.pdf?`;
    if (this.teamSearchQuery) url += `q=${encodeURIComponent(this.teamSearchQuery)}&`;
    if (this.teamCityFilter) url += `city=${encodeURIComponent(this.teamCityFilter)}&`;
    if (this.teamLimit != null) url += `limit=${this.teamLimit}&`;
    if (this.teamOffset != null) url += `offset=${this.teamOffset}&`;
    
    this.http.get(url, {
      headers: this.getHeaders(),
      responseType: 'blob',
      withCredentials: true
    }).pipe(
      catchError((err: HttpErrorResponse) => {
        console.error('Error downloading teams PDF:', err);
        this.error = this.getErrorMessage(err);
        this.loading = false;
        return throwError(() => err);
      })
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `reporte-equipos-${this.getDateString()}.pdf`);
        this.loading = false;
      },
      error: () => {
        // Error ya manejado en catchError
      }
    });
  }

  downloadPlayersPDF() {
    const teamId = this.selectedTeamId;
    if (!teamId) {
      this.error = 'Selecciona un equipo primero';
      return;
    }
    
    console.log('[DEBUG] Selected team ID:', this.selectedTeamId);
    this.loading = true;
    this.error = '';
    
    const url = `${this.reportsBaseUrl}/teams/${teamId}/players.pdf`;
    console.log('[DEBUG] Requesting URL:', url);
    
    this.http.get(url, {
      headers: this.getHeaders(),
      responseType: 'blob',
      withCredentials: true
    }).pipe(
      catchError((err: HttpErrorResponse) => {
        console.error('Error downloading players PDF:', err);
        this.error = this.getErrorMessage(err);
        this.loading = false;
        return throwError(() => err);
      })
    ).subscribe({
      next: (blob) => {
        const teamName = this.teams.find(t => t.team_id === teamId)?.name || 'equipo';
        this.downloadBlob(blob, `reporte-jugadores-${teamName}-${this.getDateString()}.pdf`);
        this.loading = false;
      },
      error: () => {
        // Error ya manejado en catchError
      }
    });
  }

  downloadGamesPDF() {
    this.loading = true;
    this.error = '';
    
    let url = `${this.reportsBaseUrl}/games.pdf?`;
    if (this.gamesStatusFilter) url += `status=${this.gamesStatusFilter}&`;
    if (this.gamesLimit != null) url += `limit=${this.gamesLimit}&`;
    if (this.gamesOffset != null) url += `offset=${this.gamesOffset}&`;
    
    this.http.get(url, {
      headers: this.getHeaders(),
      responseType: 'blob',
      withCredentials: true
    }).pipe(
      catchError((err: HttpErrorResponse) => {
        console.error('Error downloading games PDF:', err);
        this.error = this.getErrorMessage(err);
        this.loading = false;
        return throwError(() => err);
      })
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `reporte-partidos-${this.getDateString()}.pdf`);
        this.loading = false;
      },
      error: () => {
        // Error ya manejado en catchError
      }
    });
  }

  // ===== RF-REP-05: Carga de jugadores por equipo y descarga de estadísticas =====
  private loadPlayersForTeam(teamId: number) {
    this.http.get<{ items: any[] }>(`${this.reportsBaseUrl}/teams/${teamId}/players`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (resp) => {
        this.players = (resp.items || []).map(p => ({
          player_id: p.player_id ?? p.PlayerId ?? p.playerId,
          name: p.name ?? p.Name,
          number: p.number ?? p.Number ?? null,
        }));
      },
      error: (err) => {
        console.error('Error loading players for team', teamId, err);
        this.players = [];
      }
    });
  }

  downloadPlayerStatsPDF() {
    const pid = this.selectedPlayerId ?? this.playerStatsManualId;
    if (!pid) {
      this.error = 'Selecciona un jugador o ingresa su ID';
      return;
    }
    this.loading = true;
    this.error = '';

    const url = `${this.reportsBaseUrl}/players/${pid}/stats.pdf`;

    this.http.get(url, {
      headers: this.getHeaders(),
      responseType: 'blob',
      withCredentials: true
    }).pipe(
      catchError((err: HttpErrorResponse) => {
        console.error('Error downloading player stats PDF:', err);
        this.error = this.getErrorMessage(err);
        this.loading = false;
        return throwError(() => err);
      })
    ).subscribe({
      next: (blob) => {
        this.downloadBlob(blob, `reporte-stats-jugador-${pid}-${this.getDateString()}.pdf`);
        this.loading = false;
      },
      error: () => {
        // Error ya manejado
      }
    });
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0].replace(/-/g, '');
  }

  clearError() {
    this.error = '';
  }

  private getErrorMessage(err: HttpErrorResponse): string {
    if (err.status === 401) {
      return 'No autorizado. Verifica que tengas permisos de administrador.';
    } else if (err.status === 403) {
      return 'Acceso denegado. Solo administradores pueden generar reportes.';
    } else if (err.status === 404) {
      return 'Recurso no encontrado.';
    } else if (err.status === 500) {
      return 'Error del servidor al generar el reporte.';
    } else if (err.status === 0) {
      return 'No se puede conectar con el servicio de reportes. Verifica que esté activo.';
    }
    return `Error al generar reporte: ${err.message || 'Error desconocido'}`;
  }
}
