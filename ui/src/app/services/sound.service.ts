import { Injectable } from '@angular/core';

export type SoundKey =
  | 'click' | 'start' | 'quarter_end' | 'game_end' | 'undo'
  | 'score1' | 'score2' | 'score3' | 'foul' | 'error'
  | 'referee_whistle' | 'buzzer_long' | 'swish' | 'crowd_cheer' | 'crowd_boo';

type SoundCfg = { src: string; volume: number; loop?: boolean };
type SoundTable = Partial<Record<SoundKey, SoundCfg>>;

@Injectable({ providedIn: 'root' })
export class SoundService {
  // Deja síntesis como principal (latencia 0); si quieres forzar archivos, llama playAsset(...)
  private enabled = true;
  private masterVolume = 1.0;
  private unlocked = false;

  private assets: SoundTable = {
    referee_whistle: { src: 'assets/sounds/referee_whistle.mp3', volume: 1.0 },
    // Volumen reducido para que sea menos invasivo manteniendo el mismo audio
    buzzer_long:     { src: 'assets/sounds/long_buzzer.mp3',     volume: 0.55 },
    swish:           { src: 'assets/sounds/swish.mp3',           volume: 0.9 },
    crowd_cheer:     { src: 'assets/sounds/crowd_cheer.mp3',     volume: 0.8 },
    crowd_boo:       { src: 'assets/sounds/crowd_boo.mp3',       volume: 0.6 },
  };

  private html5Cache = new Map<string, HTMLAudioElement>();
  private ctx: AudioContext | null = null;

  setEnabled(v: boolean) { this.enabled = v; }
  setMasterVolume(v: number) { this.masterVolume = Math.max(0, Math.min(1, v)); }
  preloadAll() { Object.values(this.assets).forEach(cfg => cfg && this.ensureAsset(cfg.src)); }

  async unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      // @ts-ignore
      this.ctx = this.ctx ?? new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
    } catch {}
    try {
      const a = new Audio('data:audio/mp3;base64,//uQZAAAA'); a.volume = 0;
      await a.play(); a.pause();
    } catch { this.unlocked = false; }
  }

  play(key: SoundKey): void {
    if (!this.enabled) return;

    // Mapeos “reales”
    if (key === 'foul')        { if (!this.playAsset('referee_whistle')) this.playSynthFoul(); return; }
    if (key === 'quarter_end') { this.playBuzzerWithFallback(); return; }
    if (key === 'game_end')    { this.playAsset('buzzer_long'); this.playAsset('crowd_cheer', 80); return; }

    // Encestes: beep + swish
    if (key === 'score1' || key === 'score2' || key === 'score3') {
      this.playSynthScore(key);
      this.playAsset('swish', 60);
      return;
    }

    // Otros
    if (!this.playAsset(key)) this.playSynthFallback(key);
  }

  stopAll() { this.html5Cache.forEach(a => { a.pause(); a.currentTime = 0; }); }

  // ---------- Archivos ----------
  private playAsset(keyOrAlias: SoundKey, delayMs = 0): boolean {
    const cfg = this.assets[keyOrAlias];
    if (!cfg) return false;
    const audio = this.ensureAsset(cfg.src);
    if (!audio) return false;

    const fire = () => {
      audio.currentTime = 0;
      audio.loop = !!cfg.loop;
      audio.volume = (cfg.volume ?? 1) * this.masterVolume;
      audio.play().catch(async () => { await this.unlock(); audio.play().catch(() => {}); });
    };
    if (delayMs > 0) setTimeout(fire, delayMs); else fire();
    return true;
  }

  /** Intenta reproducir el buzzer MP3 y, si falla, cae a síntesis */
  private playBuzzerWithFallback() {
    const cfg = this.assets['buzzer_long'];
    const audio = cfg ? this.ensureAsset(cfg.src) : null;
    if (!audio) { this.playSynthBuzzer(); return; }

    const onError = () => { audio.removeEventListener('error', onError); this.playSynthBuzzer(); };
    audio.addEventListener('error', onError, { once: true });

    // Configurar y reproducir (similar a playAsset)
    audio.currentTime = 0;
    audio.loop = !!cfg?.loop;
    audio.volume = (cfg?.volume ?? 1) * this.masterVolume;
    audio.play()
      .then(() => { /* ok */ })
      .catch(async () => {
        await this.unlock();
        audio.play().catch(() => { this.playSynthBuzzer(); });
      });
  }

  private ensureAsset(src: string): HTMLAudioElement | null {
    const cached = this.html5Cache.get(src);
    if (cached) return cached;
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.addEventListener('error', () => console.error(`[sound] Error cargando ${src}`));
    this.html5Cache.set(src, audio);
    return audio;
  }

  // ---------- Síntesis (latencia ~0) ----------
  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      // @ts-ignore
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.ctx = null; }
    return this.ctx;
  }

  private beep(ctx: AudioContext, freq: number, ms: number, gain: number, type: OscillatorType = 'sine') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = 0;
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime, dur = ms / 1000;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);
    o.start(now); o.stop(now + dur + 0.02);
  }

  private chirp(ctx: AudioContext, startHz: number, endHz: number, ms: number, gain: number, type: OscillatorType) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(startHz, ctx.currentTime);
    o.frequency.linearRampToValueAtTime(endHz, ctx.currentTime + ms / 1000);
    g.gain.value = 0; o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime, dur = ms / 1000;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);
    o.start(now); o.stop(now + dur + 0.02);
  }

  private sequence(ctx: AudioContext, notes: Array<{ f: number; d: number; g: number }>, type: OscillatorType) {
    let t = ctx.currentTime;
    for (const n of notes) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.value = n.f; g.gain.value = 0;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(n.g, t + 0.01);
      g.gain.linearRampToValueAtTime(0.0001, t + n.d / 1000);
      o.start(t); o.stop(t + n.d / 1000 + 0.02);
      t += n.d / 1000 + 0.04;
    }
  }

  private playSynthScore(key: SoundKey) {
    const ctx = this.ensureCtx(); if (!ctx) return;
    const v = this.masterVolume;
    if (key === 'score1') this.beep(ctx, 880, 120, v * 0.6, 'sine');
    if (key === 'score2') this.sequence(ctx, [
      { f: 880, d: 110, g: v * 0.65 },
      { f: 988, d: 130, g: v * 0.65 },
    ], 'sine');
    if (key === 'score3') this.sequence(ctx, [
      { f: 880, d: 90, g: v * 0.9 },
      { f: 988, d: 100, g: v * 0.9 },
      { f: 1175, d: 140, g: v * 0.9 },
    ], 'sine');
  }

  private playSynthBuzzer() {
    const ctx = this.ensureCtx(); if (!ctx) return;
    // cuadrada con vibrato rápido ~ buzzer
    const o = ctx.createOscillator(); const g = ctx.createGain();
    const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
    o.type = 'square'; o.frequency.value = 300; g.gain.value = 0;
    lfo.type = 'sine'; lfo.frequency.value = 40; lfoGain.gain.value = 25;
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime, dur = 0.6, gain = this.masterVolume * 1.0;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.01);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);
    o.start(now); lfo.start(now); o.stop(now + dur + 0.02); lfo.stop(now + dur + 0.02);
  }

  private playSynthFoul() { const ctx = this.ensureCtx(); if (!ctx) return; this.chirp(ctx, 2200, 1200, 280, this.masterVolume * 0.9, 'sine'); }
  private playSynthFallback(key: SoundKey) {
    const ctx = this.ensureCtx(); if (!ctx) return;
    const v = this.masterVolume;
    if (key === 'start') this.chirp(ctx, 500, 900, 180, v * 0.9, 'sine');
    else if (key === 'undo') this.chirp(ctx, 700, 300, 160, v * 0.6, 'sine');
    else if (key === 'error') this.beep(ctx, 180, 260, v * 0.8, 'sawtooth');
    else this.beep(ctx, 1000, 60, v * 0.3, 'square'); // click por defecto
  }
}
