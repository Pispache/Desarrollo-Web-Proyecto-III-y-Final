import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Player, Team } from '../services/api.service';
import { Subject, merge, of, switchMap, takeUntil } from 'rxjs';

@Component({
  selector: 'app-admin-team-roster',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-team-roster.component.html',
  styleUrls: ['./admin-team-roster.component.scss'],
})
export class AdminTeamRosterComponent implements OnInit, OnDestroy {
  teams: Team[] = [];
  selectedTeamId: number | null = null;

  players: Player[] = [];
  loading = false;
  saving = false;
  errorMsg = '';

  // Form nuevo jugador
  pName = '';
  pNumber?: number | null;
  pPosition = '';
  pHeightCm?: number | null;
  pAge?: number | null;
  pNationality = '';

  private destroy$ = new Subject<void>();

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    // Carga inicial + refresco automático cuando se creen/editen/eliminen equipos
    merge(of(null), this.api.teamsChanged$)
      .pipe(
        switchMap(() => this.api.listTeams()),
        takeUntil(this.destroy$)
      )
      .subscribe(t => (this.teams = t));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackTeam = (_: number, t: Team) => t.teamId;
  trackPlayer = (_: number, p: Player) => p.playerId;

  onSelectTeam(id: number | null) {
    this.selectedTeamId = id && id > 0 ? id : null;
    this.players = [];
    if (this.selectedTeamId !== null) this.loadPlayers();
  }

  private loadPlayers() {
    if (this.selectedTeamId === null) return;
    this.loading = true;
    this.api.listPlayers(this.selectedTeamId).subscribe({
      next: rows => (this.players = rows),
      error: () => (this.players = []),
      complete: () => (this.loading = false),
    });
  }

  createPlayer() {
    if (this.selectedTeamId === null) return;
    const name = this.pName.trim();
    if (!name) {
      this.errorMsg = 'Nombre requerido';
      return;
    }

    let num: number | undefined;
    if (this.pNumber !== null && this.pNumber !== undefined && this.pNumber !== ('' as any)) {
      if (!Number.isInteger(this.pNumber) || this.pNumber < 0 || this.pNumber > 99) {
        this.errorMsg = 'El número debe ser entero entre 0 y 99.';
        return;
      }
      num = this.pNumber;
    }
    // Validaciones básicas de edad/estatura
    if (this.pAge !== null && this.pAge !== undefined && this.pAge !== ('' as any)) {
      if (!Number.isInteger(this.pAge) || this.pAge < 8 || this.pAge > 70) {
        this.errorMsg = 'La edad debe estar entre 8 y 70.';
        return;
      }
    }
    if (this.pHeightCm !== null && this.pHeightCm !== undefined && this.pHeightCm !== ('' as any)) {
      if (this.pHeightCm < 100 || this.pHeightCm > 260) {
        this.errorMsg = 'La estatura debe estar entre 100 y 260 cm.';
        return;
      }
    }

    this.saving = true;
    this.errorMsg = '';
    this.api
      .createPlayer(this.selectedTeamId, {
        name,
        number: num,
        position: this.pPosition || undefined,
        heightCm: this.pHeightCm ?? undefined,
        age: this.pAge ?? undefined,
        nationality: (this.pNationality || '').trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.pName = '';
          this.pNumber = undefined;
          this.pPosition = '';
          this.pHeightCm = undefined;
          this.pAge = undefined;
          this.pNationality = '';
          this.loadPlayers();
        },
        error: err => {
          this.errorMsg = err?.error?.error || 'No se pudo crear el jugador (¿número duplicado?).';
        },
        complete: () => (this.saving = false),
      });
  }

  deletePlayer(p: Player) {
    if (!confirm(`Eliminar a ${p.name}?`)) return;
    this.api.deletePlayer(p.playerId).subscribe(() => this.loadPlayers());
  }
}
