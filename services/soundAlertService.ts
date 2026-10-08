/**
 * Sound Alert & Modern Intelligent Acoustics Service for Lamsa Perfume POS
 * Synthesizes luxurious, modern, intelligent UI audio effects using HTML5 Web Audio API.
 * High-fidelity polyphonic chords, warm acoustic decays, harmonic overtones, and tactile haptic clicks.
 * 100% offline, zero external asset dependencies, zero network latency.
 */

export type SoundThemeProfile = 'modern_luxury' | 'apple_acoustic' | 'minimal_haptic';

export interface SoundServiceConfig {
  enabled: boolean;
  volume: number; // 0.0 to 1.0
  profile: SoundThemeProfile;
}

class SoundAlertService {
  private audioCtx: AudioContext | null = null;
  private isSoundEnabled: boolean = true;
  private volume: number = 0.75;
  private profile: SoundThemeProfile = 'modern_luxury';

  constructor() {
    try {
      if (typeof window !== 'undefined') {
        const savedEnabled = localStorage.getItem('lamsa_sound_alerts_enabled_v2');
        if (savedEnabled !== null) {
          this.isSoundEnabled = savedEnabled === 'true';
        } else {
          // Fallback to legacy key if present
          const legacy = localStorage.getItem('lamsa_owner_sound_alerts_enabled_v1');
          this.isSoundEnabled = legacy !== 'false';
        }

        const savedVol = localStorage.getItem('lamsa_sound_alerts_volume_v2');
        if (savedVol) {
          const parsed = parseFloat(savedVol);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this.volume = parsed;
          }
        }

        const savedProfile = localStorage.getItem('lamsa_sound_alerts_profile_v2') as SoundThemeProfile;
        if (savedProfile && ['modern_luxury', 'apple_acoustic', 'minimal_haptic'].includes(savedProfile)) {
          this.profile = savedProfile;
        }
      }
    } catch {
      this.isSoundEnabled = true;
      this.volume = 0.75;
      this.profile = 'modern_luxury';
    }

    // Auto-unlock audio context on mobile & laptop on user gesture
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        try {
          const ctx = this.getAudioContext();
          if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
        } catch {
          // ignore
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.isSoundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.isSoundEnabled = enabled;
    try {
      localStorage.setItem('lamsa_sound_alerts_enabled_v2', enabled ? 'true' : 'false');
      localStorage.setItem('lamsa_owner_sound_alerts_enabled_v1', enabled ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume = clamped;
    try {
      localStorage.setItem('lamsa_sound_alerts_volume_v2', String(clamped));
    } catch {
      // ignore
    }
  }

  public getProfile(): SoundThemeProfile {
    return this.profile;
  }

  public setProfile(profile: SoundThemeProfile): void {
    this.profile = profile;
    try {
      localStorage.setItem('lamsa_sound_alerts_profile_v2', profile);
    } catch {
      // ignore
    }
  }

  public getConfig(): SoundServiceConfig {
    return {
      enabled: this.isSoundEnabled,
      volume: this.volume,
      profile: this.profile,
    };
  }

  /**
   * 1. SALE SUCCESS CHIME (نجاح عملية البيع والتحصيل)
   * Polyphonic luxury boutique register chime with warm golden overtones.
   * C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz) -> C6 (1046Hz) + sparkling overtone B6 (1975Hz).
   */
  public playSaleChime(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      if (this.profile === 'minimal_haptic') {
        // Fast dual crystal snap for ultra-speed cashiers
        this.synthesizeTone(ctx, 1046.5, now, 0.15, 'sine', 0.22 * vol);
        this.synthesizeTone(ctx, 1568.0, now + 0.05, 0.22, 'sine', 0.28 * vol);
        return;
      }

      if (this.profile === 'apple_acoustic') {
        // Soft ascending major triad (F5, A5, C6)
        const notes = [698.46, 880.0, 1046.5];
        notes.forEach((freq, idx) => {
          this.synthesizeWarmAcousticNote(ctx, freq, now + idx * 0.09, 0.65, 0.24 * vol);
        });
        return;
      }

      // Default: modern_luxury (Grand Boutique Register Bloom)
      const chord = [
        { freq: 523.25, time: 0.00, dur: 0.85, gain: 0.26 }, // C5 Warm Root
        { freq: 659.25, time: 0.08, dur: 0.80, gain: 0.25 }, // E5 Major Third
        { freq: 783.99, time: 0.16, dur: 0.75, gain: 0.24 }, // G5 Fifth
        { freq: 1046.5, time: 0.24, dur: 0.90, gain: 0.28 }, // C6 Crystal Octave
        { freq: 1975.5, time: 0.28, dur: 0.40, gain: 0.10 }, // B6 Shimmer Overtone
      ];

      chord.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle'; // Richer harmonic body
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        // Warm acoustic lowpass filter
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3600, now + note.time);
        filter.Q.setValueAtTime(1.5, now + note.time);

        const startTime = now + note.time;
        const targetGain = note.gain * vol;

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + note.dur + 0.05);
      });
    } catch (e) {
      console.warn('Sale chime error:', e);
    }
  }

  /**
   * 2. REGISTRATION / AUTH / LOGIN SUCCESS (نجاح التسجيل وتوثيق الحساب)
   * Prestigious welcoming glass-bloom chord (visionOS / macOS inspired).
   * Ascending welcoming chord (F5 -> A5 -> C6 -> E6).
   */
  public playRegisterSuccessChime(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      const welcomingNotes = [
        { freq: 587.33, time: 0.00, dur: 0.60, gain: 0.22 }, // D5
        { freq: 739.99, time: 0.07, dur: 0.65, gain: 0.24 }, // F#5
        { freq: 880.00, time: 0.14, dur: 0.70, gain: 0.26 }, // A5
        { freq: 1174.66, time: 0.22, dur: 0.85, gain: 0.28 }, // D6 Welcoming Crown
      ];

      welcomingNotes.forEach(note => {
        const osc = ctx.createOscillator();
        const oscDetune = ctx.createOscillator(); // Gentle chorus bloom
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        oscDetune.type = 'sine';
        oscDetune.frequency.setValueAtTime(note.freq * 1.002, now + note.time); // +3.5 cents chorus

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4200, now + note.time);

        const startTime = now + note.time;
        const targetGain = note.gain * vol * 0.65;

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);

        osc.connect(filter);
        oscDetune.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        oscDetune.start(startTime);
        osc.stop(startTime + note.dur + 0.05);
        oscDetune.stop(startTime + note.dur + 0.05);
      });
    } catch (e) {
      console.warn('Register success chime error:', e);
    }
  }

  /**
   * Alias for authentication / user switch success
   */
  public playAuthSuccessChime(): void {
    this.playRegisterSuccessChime();
  }

  /**
   * 3. ITEM ADDED TO CART / INVENTORY (إضافة عنصر إلى السلة أو المخزون)
   * Modern tactile crystal pop & subtle droplet ping.
   * Glides smoothly 980Hz -> 1320Hz. Pleasant, non-fatiguing, crisp.
   */
  public playItemAddedChime(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // B5
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.045); // Glides to E6

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.24 * vol, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {
      console.warn('Item added chime error:', e);
    }
  }

  /**
   * 4. SMART NOTIFICATION CHIME (إشعارات النظام الحديثة والتنبيهات الذكية)
   * Modern double-tap acoustic ping (iOS / watchOS inspired).
   * G5 (784Hz) -> C6 (1046Hz) 65ms apart.
   */
  public playNotificationChime(category?: string): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      if (category === 'warning' || category === 'alert') {
        this.playAlertChime();
        return;
      }
      if (category === 'sale' || category === 'invoice') {
        this.playSaleChime();
        return;
      }
      if (category === 'goal' || category === 'success') {
        this.playRegisterSuccessChime();
        return;
      }

      // Elegant Apple-style double acoustic tap
      const tap1Time = now;
      const tap2Time = now + 0.075;

      // Note 1: G5
      this.synthesizeWarmAcousticNote(ctx, 783.99, tap1Time, 0.28, 0.20 * vol);
      // Note 2: C6 (Resolving)
      this.synthesizeWarmAcousticNote(ctx, 1046.50, tap2Time, 0.42, 0.25 * vol);
    } catch (e) {
      console.warn('Notification chime error:', e);
    }
  }

  /**
   * 5. GENERAL STORE ACTION (حفظ، إغلاق يومية، مصروف، تعديل ناجح)
   */
  public playActionChime(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      // Single warm acoustic bloom (A5 -> D6)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880.0, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.06);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22 * vol, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch (e) {
      console.warn('Action chime error:', e);
    }
  }

  /**
   * 6. WARNING / COST LIMIT / LOW STOCK ALERT (تنبيه ذكي غير مزعج)
   * Respectful soft minor harmonic dual-tone (E5 -> B4).
   */
  public playAlertChime(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      const notes = [659.25, 493.88]; // E5 -> B4
      notes.forEach((freq, idx) => {
        const startTime = now + idx * 0.12;
        this.synthesizeTone(ctx, freq, startTime, 0.35, 'sine', 0.18 * vol);
      });
    } catch (e) {
      console.warn('Alert chime error:', e);
    }
  }

  /**
   * 7. DELETE / REVERSAL / CANCEL (حذف صنف أو قيد عكسي)
   * Soft wooden tactile low-frequency tap.
   */
  public playDeleteChime(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(261.63, now); // C4
      osc.frequency.exponentialRampToValueAtTime(164.81, now + 0.08); // E3

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.20 * vol, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {
      console.warn('Delete chime error:', e);
    }
  }

  /**
   * 8. HAPTIC MICRO-TICK (نقرة تفاعلية فائقة النعومة)
   */
  public playHapticClick(): void {
    if (!this.isSoundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const vol = this.volume;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.012);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12 * vol, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch {
      // ignore
    }
  }

  /**
   * Helper: Synthesizes a warm acoustic note with gentle envelope
   */
  private synthesizeWarmAcousticNote(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    targetGain: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  /**
   * Helper: Basic clean oscillator synthesis
   */
  private synthesizeTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    targetGain: number
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.04);
  }

  /**
   * Preview test suite for UI testing in settings/studio
   */
  public previewSound(
    type: 'sale' | 'register' | 'add_item' | 'notification' | 'action' | 'warning' | 'delete'
  ): void {
    // Temporarily ensure context is active
    this.getAudioContext();
    switch (type) {
      case 'sale':
        this.playSaleChime();
        break;
      case 'register':
        this.playRegisterSuccessChime();
        break;
      case 'add_item':
        this.playItemAddedChime();
        break;
      case 'notification':
        this.playNotificationChime();
        break;
      case 'action':
        this.playActionChime();
        break;
      case 'warning':
        this.playAlertChime();
        break;
      case 'delete':
        this.playDeleteChime();
        break;
    }
  }
}

export const soundAlertService = new SoundAlertService();
