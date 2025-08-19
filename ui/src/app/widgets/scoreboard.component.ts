import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Game, GameDetail } from '../services/api.service';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scoreboard.component.html',
})
export class ScoreboardComponent {
  @Input({ required: true }) game!: Game;
  @Input() events: GameDetail['events'] = [];
}
