import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';

export interface ClockState {
  running: boolean;
  remainingMs: number;
  quarterMs: number;
}

const LS_KEY = (id: number) => `clock:${id}`;

@Injectable({ providedIn: 'root' })
export class ClockService {
    //TIEMPO POR CUARTO 1/4
  private defaultQuarterMs = 10 * 60 * 1000; 
  private subs: Record<number, Subscription | undefined> = {};
  private states: Record<number, BehaviorSubject<ClockState>> = {};

  state$(gameId: number) {
    if (!this.states[gameId]) {
      const saved = this.load(gameId);
      this.states[gameId] = new BehaviorSubject<ClockState>(
        saved ?? { running: false, remainingMs: this.defaultQuarterMs, quarterMs: this.defaultQuarterMs }
      );
    }
    return this.states[gameId].asObservable();
  }

  start(gameId: number) {
    const s = this.ensureState(gameId);
    if (s.running) return;
    s.running = true;
    this.push(gameId, s);
    this.tick(gameId);
  }

  pause(gameId: number) {
    const s = this.ensureState(gameId);
    s.running = false;
    this.push(gameId, s);
    this.stopTick(gameId);
  }

  resetForNewQuarter(gameId: number, quarterMs?: number) {
    const s = this.ensureState(gameId);
    s.running = false;
    s.quarterMs = quarterMs ?? this.defaultQuarterMs;
    s.remainingMs = s.quarterMs;
    this.push(gameId, s);
    this.stopTick(gameId);
  }

  stop(gameId: number) { this.pause(gameId); }

  // ===== Internos =====
  private ensureState(gameId: number): ClockState {
    if (!this.states[gameId]) this.state$(gameId); // inicializa si no existía
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.states[gameId]!.value as ClockState;
  }

  private tick(gameId: number) {
    this.stopTick(gameId);
    this.subs[gameId] = interval(1000).subscribe(() => {
      const s = this.ensureState(gameId);
      if (!s.running) return;
      s.remainingMs = Math.max(0, s.remainingMs - 1000);
      this.push(gameId, s);
      if (s.remainingMs === 0) this.pause(gameId);
    });
  }

  private stopTick(gameId: number) {
    this.subs[gameId]?.unsubscribe();
    this.subs[gameId] = undefined;
  }

  private push(gameId: number, s: ClockState) {
    this.states[gameId]?.next({ ...s });
    this.save(gameId, s);
  }

  private save(gameId: number, s: ClockState) {
    try { localStorage.setItem(LS_KEY(gameId), JSON.stringify(s)); } catch { /* SSR/priv mode */ }
  }

  private load(gameId: number): ClockState | null {
    try {
      const raw = localStorage.getItem(LS_KEY(gameId));
      if (!raw) return null;
      return JSON.parse(raw) as ClockState;
    } catch { return null; }
  }
}
