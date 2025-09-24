import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService, Player, TeamDto } from '../services/api.service';
import { NotificationService } from '../services/notification.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-team-manage-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="container-fluid py-3">
    <div class="d-flex align-items-center justify-content-between mb-3">
      <h4 class="mb-0 d-flex align-items-center gap-2">
        <i class="bi bi-people"></i>
        Gestionar Equipo
        <span *ngIf="team" class="badge bg-secondary ms-2">#{{ team.teamId }}</span>
      </h4>
      <div class="d-flex gap-2">
        <a class="btn btn-outline-secondary" [routerLink]="['/']">
          <i class="bi bi-arrow-left"></i> Volver
        </a>
      </div>
    </div>

    <div class="card shadow-sm border-0">
      <div class="card-header header-contrast-high">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-3">
            <div class="d-flex align-items-center gap-2">
              <div class="fw-semibold">Equipo:</div>
              <div class="d-flex align-items-center gap-2">
                <img *ngIf="team && team.logoUrl && getLogoUrl(team.logoUrl) as url" [src]="url" alt="logo" style="height:32px; width:32px; object-fit:contain;" class="rounded border border-secondary">
                <span class="fw-bold">{{ team?.name || '—' }}</span>
                <span class="text-muted">• {{ team?.city || '—' }}</span>
              </div>
            </div>
          </div>
          <div class="text-muted small">Administración de jugadores</div>
        </div>
      </div>
      <div class="card-body">
        <!-- Formulario: Agregar jugador -->
        <div class="border rounded p-3 mb-3 bg-dark text-light border-secondary">
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-6 col-xl-4">
              <label class="form-label mb-1">Nombre del jugador</label>
              <input class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="newPlayerName" placeholder="Ej. Juan Pérez">
            </div>
            <div class="col-6 col-xl-2">
              <label class="form-label mb-1">Número</label>
              <input class="form-control form-control-sm bg-dark text-light border-secondary" type="number" [(ngModel)]="newPlayerNumber" placeholder="Ej. 10">
            </div>
            <div class="col-6 col-xl-3">
              <label class="form-label mb-1">Posición (opcional)</label>
              <input class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="newPlayerPosition" placeholder="Base, Alero, etc.">
            </div>
            <div class="col-6 col-xl-2">
              <label class="form-label mb-1">Estatura (cm)</label>
              <input class="form-control form-control-sm bg-dark text-light border-secondary" type="number" [(ngModel)]="newPlayerHeightCm" placeholder="Ej. 185" min="100" max="260">
            </div>
            <div class="col-6 col-xl-2">
              <label class="form-label mb-1">Edad</label>
              <input class="form-control form-control-sm bg-dark text-light border-secondary" type="number" [(ngModel)]="newPlayerAge" placeholder="Ej. 22" min="8" max="70">
            </div>
            <div class="col-12 col-xl-3">
              <label class="form-label mb-1">Nacionalidad</label>
              <input class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="newPlayerNationality" placeholder="Ej. Guatemala">
            </div>
            <div class="col-12 col-xl-3 d-grid">
              <button class="btn btn-sm btn-success" (click)="addPlayer()" [disabled]="saving || !newPlayerName.trim()">
                <i class="bi bi-plus-circle"></i> Agregar jugador
              </button>
            </div>
          </div>
        </div>

        <!-- Lista de jugadores -->
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th style="width:90px">ID</th>
                <th style="width:110px">#</th>
                <th>Nombre</th>
                <th>Posición</th>
                <th>Estatura</th>
                <th>Edad</th>
                <th>Nacionalidad</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of players; trackBy: trackByPlayerId">
                <td class="text-muted">#{{ p.playerId }}</td>
                <td>
                  <span *ngIf="editingId !== p.playerId" class="badge bg-secondary">{{ p.number ?? '—' }}</span>
                  <input *ngIf="editingId === p.playerId" type="number" class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="editNumber">
                </td>
                <td>
                  <span *ngIf="editingId !== p.playerId" class="fw-medium">{{ p.name }}</span>
                  <input *ngIf="editingId === p.playerId" class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="editName">
                </td>
                <td>
                  <span *ngIf="editingId !== p.playerId">{{ p.position || '—' }}</span>
                  <input *ngIf="editingId === p.playerId" class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="editPosition">
                </td>
                <td>
                  <span *ngIf="editingId !== p.playerId">{{ p.heightCm ? (p.heightCm + ' cm') : '—' }}</span>
                  <input *ngIf="editingId === p.playerId" type="number" class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="editHeightCm" min="100" max="260" placeholder="cm">
                </td>
                <td>
                  <span *ngIf="editingId !== p.playerId">{{ p.age ?? '—' }}</span>
                  <input *ngIf="editingId === p.playerId" type="number" class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="editAge" min="8" max="70" placeholder="edad">
                </td>
                <td>
                  <span *ngIf="editingId !== p.playerId">{{ p.nationality || '—' }}</span>
                  <input *ngIf="editingId === p.playerId" class="form-control form-control-sm bg-dark text-light border-secondary" [(ngModel)]="editNationality" placeholder="Nacionalidad">
                </td>
                <td class="text-end">
                  <ng-container *ngIf="editingId !== p.playerId; else editing">
                    <button class="btn btn-sm btn-outline-primary" (click)="startEdit(p)"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger ms-1" (click)="deletePlayer(p)"><i class="bi bi-trash"></i></button>
                  </ng-container>
                  <ng-template #editing>
                    <button class="btn btn-sm btn-success" (click)="savePlayer(p)" [disabled]="saving || !editName.trim()"><i class="bi bi-check2"></i></button>
                    <button class="btn btn-sm btn-outline-secondary ms-1" (click)="cancelEdit()"><i class="bi bi-x"></i></button>
                  </ng-template>
                </td>
              </tr>
              <tr *ngIf="players.length === 0">
                <td colspan="5" class="text-center text-muted py-3">No hay jugadores registrados</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  `
})
export class TeamManagePageComponent implements OnInit, OnDestroy {
  teamId!: number;
  team: TeamDto | null = null;
  players: Player[] = [];

  // add form
  newPlayerName = '';
  newPlayerNumber: number | null = null;
  newPlayerPosition = '';
  newPlayerHeightCm: number | null = null;
  newPlayerAge: number | null = null;
  newPlayerNationality: string = '';

  // edit state
  editingId: number | null = null;
  editName = '';
  editNumber: number | null = null;
  editPosition = '';
  editHeightCm: number | null = null;
  editAge: number | null = null;
  editNationality: string = '';

  saving = false;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private notify: NotificationService
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = Number(idParam);
    if (!id || isNaN(id)) {
      this.notify.showError('Error', 'ID de equipo inválido', true);
      this.router.navigateByUrl('/');
      return;
    }
    this.teamId = id;
    this.loadTeam();
    this.loadPlayers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getLogoUrl(logoUrl?: string | null): string | null {
    if (!logoUrl) return null;
    const url = logoUrl.trim();
    if (!url) return null;
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    const prefix = (location.port === '4200') ? `${location.protocol}//${location.hostname}:8080` : '';
    const sep = url.startsWith('/') ? '' : '/';
    return `${prefix}${sep}${url}`;
  }

  loadTeam() {
    this.api.getTeam(this.teamId).subscribe({
      next: (t) => this.team = t,
      error: () => this.notify.showError('Error', 'No se pudo cargar el equipo', true)
    });
  }

  loadPlayers() {
    this.api.listPlayers(this.teamId).subscribe({
      next: (ps) => this.players = ps,
      error: () => this.notify.showError('Error', 'No se pudieron cargar los jugadores', true)
    });
  }

  addPlayer() {
    const name = (this.newPlayerName || '').trim();
    const number = this.newPlayerNumber ?? undefined;
    const position = (this.newPlayerPosition || '').trim() || undefined;
    if (!name) { this.notify.showWarning('Validación', 'El nombre es obligatorio'); return; }
    // Validaciones básicas
    if (this.newPlayerAge != null) {
      const a = Number(this.newPlayerAge);
      if (!Number.isInteger(a) || a < 8 || a > 70) { this.notify.showWarning('Validación', 'La edad debe estar entre 8 y 70'); return; }
    }
    if (this.newPlayerHeightCm != null) {
      const h = Number(this.newPlayerHeightCm);
      if (h < 100 || h > 260) { this.notify.showWarning('Validación', 'La estatura debe estar entre 100 y 260 cm'); return; }
    }
    this.saving = true;
    this.api.createPlayer(this.teamId, {
      name,
      number: number as any,
      position: position as any,
      heightCm: this.newPlayerHeightCm != null ? Number(this.newPlayerHeightCm) : undefined,
      age: this.newPlayerAge != null ? Number(this.newPlayerAge) : undefined,
      nationality: (this.newPlayerNationality || '').trim() || undefined,
    }).subscribe({
      next: () => {
        this.newPlayerName = '';
        this.newPlayerNumber = null;
        this.newPlayerPosition = '';
        this.newPlayerHeightCm = null;
        this.newPlayerAge = null;
        this.newPlayerNationality = '';
        this.loadPlayers();
        this.notify.showSuccess('Jugador agregado', name);
      },
      error: () => this.notify.showError('Error', 'No se pudo crear el jugador', true),
      complete: () => this.saving = false
    });
  }

  startEdit(p: Player) {
    this.editingId = p.playerId;
    this.editName = p.name;
    this.editNumber = p.number ?? null;
    this.editPosition = p.position ?? '';
    this.editHeightCm = (p.heightCm as any) ?? null;
    this.editAge = (p.age as any) ?? null;
    this.editNationality = p.nationality ?? '';
  }

  cancelEdit() {
    this.editingId = null;
    this.editName = '';
    this.editNumber = null;
    this.editPosition = '';
    this.editHeightCm = null;
    this.editAge = null;
    this.editNationality = '';
  }

  savePlayer(p: Player) {
    const name = (this.editName || '').trim();
    if (!name) { this.notify.showWarning('Validación', 'El nombre es obligatorio'); return; }
    const patch: any = { name };
    if (this.editNumber !== null && this.editNumber !== undefined) patch.number = this.editNumber;
    if ((this.editPosition || '').trim()) patch.position = this.editPosition.trim();
    // Validaciones básicas
    if (this.editAge != null) {
      const a = Number(this.editAge);
      if (!Number.isInteger(a) || a < 8 || a > 70) { this.notify.showWarning('Validación', 'La edad debe estar entre 8 y 70'); return; }
    }
    if (this.editHeightCm != null) {
      const h = Number(this.editHeightCm);
      if (h < 100 || h > 260) { this.notify.showWarning('Validación', 'La estatura debe estar entre 100 y 260 cm'); return; }
    }
    if (this.editHeightCm != null) patch.heightCm = Number(this.editHeightCm);
    if (this.editAge != null) patch.age = Number(this.editAge);
    if ((this.editNationality || '').trim()) patch.nationality = this.editNationality.trim();
    this.saving = true;
    this.api.updatePlayer(p.playerId, patch).subscribe({
      next: () => {
        this.notify.showSuccess('Jugador actualizado', name);
        this.cancelEdit();
        this.loadPlayers();
      },
      error: () => this.notify.showError('Error', 'No se pudo actualizar el jugador', true),
      complete: () => this.saving = false
    });
  }

  deletePlayer(p: Player) {
    this.notify.confirm(`¿Eliminar al jugador "${p.name}"?`, 'Confirmar').then(ok => {
      if (!ok) return;
      this.api.deletePlayer(p.playerId).subscribe({
        next: () => {
          this.players = this.players.filter(x => x.playerId !== p.playerId);
          this.notify.showSuccess('Jugador eliminado', p.name);
        },
        error: () => this.notify.showError('Error', 'No se pudo eliminar el jugador', true)
      });
    });
  }

  trackByPlayerId(index: number, p: Player) { return p.playerId; }
}
