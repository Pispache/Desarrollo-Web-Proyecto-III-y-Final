import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { interval, Subscription, switchMap } from 'rxjs';

import { ApiService, GameDetail } from '../services/api.service';
import { ScoreboardComponent } from '../widgets/scoreboard.component';
import { ClockComponent } from '../widgets/clock.component';

@Component({
  selector: 'app-display-page',
  standalone: true,
  imports: [CommonModule, ScoreboardComponent, ClockComponent],
  templateUrl: './display-page.component.html',
})
export class DisplayPageComponent implements OnInit, OnDestroy {
  detail?: GameDetail;
  private gameId!: number;
  private sub?: Subscription;

  constructor(private route: ActivatedRoute, private api: ApiService) {}

  ngOnInit(): void {
    this.gameId = Number(this.route.snapshot.paramMap.get('id'));
    // Polling ligero para sincronizar el marcador público
    this.sub = interval(2000)
      .pipe(switchMap(() => this.api.getGame(this.gameId)))
      .subscribe((d) => (this.detail = d));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}