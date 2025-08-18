import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService, GameDetail } from '../services/api.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ClockComponent } from '../widgets/clock.component';
import { interval, Subscription, switchMap } from 'rxjs';

@Component({
  selector: 'app-display-page',
  standalone: true,
  imports: [CommonModule, ScoreboardComponent, ClockComponent],
  template: `
    <div class="min-h-screen grid place-items-center bg-black text-white">
      <div class="w-full max-w-4xl p-4">
        <app-scoreboard [game]="detail?.game"></app-scoreboard>

        <!-- Cronómetro visible pero sin controles (solo lectura) -->
        <app-clock
          [gameId]="detail?.game?.gameId"
          [status]="detail?.game?.status"
          [quarter]="detail?.game?.quarter">
        </app-clock>

        <!-- Lista simple de eventos (opcional, o quítala si quieres más “limpio” para público) -->
        <!--
        <div class="mt-4 text-sm text-gray-300 border border-gray-700 rounded p-3">
          <div class="font-medium mb-1">Eventos recientes</div>
          <div class="max-h-48 overflow-auto">
            <div *ngFor="let e of detail?.events">
              Q{{e.quarter}} - {{e.team}} - {{e.eventType}} ({{e.createdAt}})
            </div>
          </div>
        </div>
        -->
      </div>
    </div>
  `
})
export class DisplayPageComponent implements OnInit, OnDestroy {
  detail?: GameDetail;
  private gameId!: number;
  private sub?: Subscription;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    this.gameId = Number(this.route.snapshot.paramMap.get('id'));
    // polling suave cada 2s para mantener sincronizado el público
    this.sub = interval(2000)
      .pipe(switchMap(() => this.api.getGame(this.gameId)))
      .subscribe(d => this.detail = d);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
