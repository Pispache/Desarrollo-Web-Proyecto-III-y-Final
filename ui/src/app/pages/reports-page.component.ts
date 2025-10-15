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
  
  // Filtros para partidos
  gamesFromDate = '';
  gamesToDate = '';
  gamesStatusFilter = '';
  
  // Filtro para jugadores
  selectedTeamId: number | null = null;
  teams: Team[] = [];
  
  loading = false;
  error = '';

  private reportsBaseUrl = 'http://localhost:8081/v1/reports';
  private apiBaseUrl = 'http://localhost:8080/api';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadTeams();
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
    
    // Cargar equipos desde la API principal, no desde reportes
    this.http.get<Team[]>(`${this.apiBaseUrl}/teams`, {
      headers: this.getHeaders()
    }).subscribe({
      next: (teams) => {
        this.teams = teams;
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
    if (!this.selectedTeamId) {
      this.error = 'Selecciona un equipo primero';
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    const url = `${this.reportsBaseUrl}/teams/${this.selectedTeamId}/players.pdf`;
    
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
        const teamName = this.teams.find(t => t.team_id === this.selectedTeamId)?.name || 'equipo';
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
    if (this.gamesFromDate) url += `from=${this.gamesFromDate}&`;
    if (this.gamesToDate) url += `to=${this.gamesToDate}&`;
    if (this.gamesStatusFilter) url += `status=${this.gamesStatusFilter}&`;
    
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
