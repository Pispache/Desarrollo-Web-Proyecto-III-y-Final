import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Player } from '../services/api.service';

@Component({
  selector: 'app-team-roster',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-roster.component.html',
})
export class TeamRosterComponent implements OnChanges {
  @Input({ required: true }) gameId!: number;
  @Input({ required: true }) side!: 'HOME' | 'AWAY';

  players: Player[] = [];

  constructor(private api: ApiService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (!this.gameId || !this.side) return;
    this.api.listGamePlayers(this.gameId, this.side).subscribe(ps => (this.players = ps));
  }
}