import { Component, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationDisplayComponent } from './components/notification-display.component';
import { SoundService } from './services/sound.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NotificationDisplayComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private armed = false;
  constructor(private sound: SoundService) {}

  @HostListener('document:click') onClick() { this.armAudio(); }
  @HostListener('document:keydown') onKey() { this.armAudio(); }
  @HostListener('document:touchstart') onTouch() { this.armAudio(); }

  private armAudio() {
    if (this.armed) return;
    this.armed = true;
    this.sound.preloadAll();
    this.sound.unlock();
  }
}
