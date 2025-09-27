import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NotificationDisplayComponent } from './components/notification-display.component';
import { NavbarComponent } from './components/navbar.component';
import { SoundService } from './services/sound.service';
import { AuthService } from './services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NotificationDisplayComponent, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private armed = false;
  showNavbar = true;
  private sub?: Subscription;
  constructor(private sound: SoundService, private auth: AuthService) {}

  ngOnInit(): void {
    // Navbar siempre visible (contiene enlaces públicos y protegidos)
    this.showNavbar = true;
    this.sub = this.auth.authed$.subscribe(() => {});
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

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
