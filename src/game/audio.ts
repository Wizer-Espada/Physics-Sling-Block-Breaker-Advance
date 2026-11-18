export type AudioChannel = 'music' | 'sfx' | 'ambient';

export interface AudioVolumeSettings {
  music: number;
  sfx: number;
  ambient: number;
}

export const DEFAULT_AUDIO_VOLUMES: AudioVolumeSettings = {
  music: 0.75,
  sfx: 0.85,
  ambient: 0.7,
};

const MUTED_STORAGE_KEY = 'prism_sling_muted';
const VOLUMES_STORAGE_KEY = 'prism_sling_audio_volumes_v1';

// 4-bar chill D minor 9 -> Bbmaj7 -> Gm9 -> Am7 lo-fi progression
const LOFI_CHORDS = [
  {
    bass: 73.42,
    pad: [146.83, 174.61, 220.0, 261.63, 329.63],
    arp: [587.33, 659.25, 523.25, 440.0],
  }, // Dm9
  {
    bass: 58.27,
    pad: [116.54, 146.83, 174.61, 220.0, 293.66],
    arp: [523.25, 587.33, 440.0, 349.23],
  }, // Bbmaj7
  {
    bass: 98.0,
    pad: [146.83, 174.61, 233.08, 261.63, 329.63],
    arp: [587.33, 466.16, 523.25, 392.0],
  }, // Gm9
  {
    bass: 110.0,
    pad: [130.81, 164.81, 196.0, 246.94, 293.66],
    arp: [523.25, 659.25, 493.88, 392.0],
  }, // Am9/7
];

const STEP_DURATION_SEC = 0.42; // ~71.4 BPM eighth-note pulse
const STEPS_PER_BAR = 8;
const MUSIC_TARGET_GAIN = 0.28;
const AMBIENT_TARGET_GAIN = 0.3;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export type ComboVoiceTier = 1 | 2 | 3 | 4;

interface FormantSyllable {
  offset: number;
  duration: number;
  f0Start: number;
  f0End: number;
  f1Start: number;
  f1End: number;
  f2Start: number;
  f2End: number;
  gain: number;
  preBurstFreq?: number;
  preBurstDur?: number;
  preBurstGain?: number;
  postBurstFreq?: number;
  postBurstDur?: number;
  postBurstGain?: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private volumes: AudioVolumeSettings = { ...DEFAULT_AUDIO_VOLUMES };
  private lastHitTime: number = 0;
  private lastWallTime: number = 0;
  private lastVoiceTime: number = 0;
  private voiceNoiseBuffer: AudioBuffer | null = null;

  // Dedicated SFX output bus
  private sfxMasterGain: GainNode | null = null;

  // Dedicated Music (bass + arpeggio + tape delay) & Ambient (warm pads + atmospheric bed) buses
  private musicWanted: boolean = false;
  private musicTimerId: number | null = null;
  private musicNextStepTime: number = 0;
  private musicStepIndex: number = 0;
  private musicMasterGain: GainNode | null = null;
  private musicWarmFilter: BiquadFilterNode | null = null;
  private musicDelaySend: GainNode | null = null;

  private ambientMasterGain: GainNode | null = null;
  private ambientWarmFilter: BiquadFilterNode | null = null;
  private ambientAirGain: GainNode | null = null;
  private ambientAirStarted: boolean = false;

  private musicGeneration: number = 0;

  constructor() {
    try {
      const savedMute = localStorage.getItem(MUTED_STORAGE_KEY);
      if (savedMute === 'true') {
        this.muted = true;
      }

      const savedVols = localStorage.getItem(VOLUMES_STORAGE_KEY);
      if (savedVols) {
        const parsed = JSON.parse(savedVols) as Partial<AudioVolumeSettings>;
        if (parsed && typeof parsed === 'object') {
          this.volumes = {
            music:
              typeof parsed.music === 'number'
                ? clampUnit(parsed.music)
                : DEFAULT_AUDIO_VOLUMES.music,
            sfx:
              typeof parsed.sfx === 'number'
                ? clampUnit(parsed.sfx)
                : DEFAULT_AUDIO_VOLUMES.sfx,
            ambient:
              typeof parsed.ambient === 'number'
                ? clampUnit(parsed.ambient)
                : DEFAULT_AUDIO_VOLUMES.ambient,
          };
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveVolumes(): void {
    try {
      localStorage.setItem(VOLUMES_STORAGE_KEY, JSON.stringify(this.volumes));
    } catch {
      // Ignore storage errors
    }
  }

  private ensureContext(allowWhenMuted = false): AudioContext | null {
    if (this.muted && !allowWhenMuted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureSfxContext(): { ctx: AudioContext; out: GainNode } | null {
    if (this.muted || this.volumes.sfx <= 0.001) return null;
    const ctx = this.ensureContext();
    if (!ctx) return null;

    if (!this.sfxMasterGain) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volumes.sfx, ctx.currentTime);
      gain.connect(ctx.destination);
      this.sfxMasterGain = gain;
    }

    return { ctx, out: this.sfxMasterGain };
  }

  private ensureLoopGraphs(ctx: AudioContext): void {
    if (
      this.musicMasterGain &&
      this.musicWarmFilter &&
      this.musicDelaySend &&
      this.ambientMasterGain &&
      this.ambientWarmFilter
    ) {
      return;
    }

    const now = ctx.currentTime;

    // 1. Music bus (lo-fi bass & Rhodes/bell arpeggio + tape echo)
    if (!this.musicMasterGain || !this.musicWarmFilter || !this.musicDelaySend) {
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1250, now);
      filter.Q.setValueAtTime(0.65, now);

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.14, now);
      lfoGain.gain.setValueAtTime(220, now);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      const delay = ctx.createDelay(1.0);
      delay.delayTime.setValueAtTime(0.315, now);
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.setValueAtTime(0.32, now);
      const delayFilter = ctx.createBiquadFilter();
      delayFilter.type = 'lowpass';
      delayFilter.frequency.setValueAtTime(1350, now);
      const delaySend = ctx.createGain();
      delaySend.gain.setValueAtTime(0.45, now);

      delaySend.connect(delay);
      delay.connect(delayFilter);
      delayFilter.connect(delayFeedback);
      delayFeedback.connect(delay);
      delayFilter.connect(filter);

      filter.connect(master);
      master.connect(ctx.destination);

      this.musicMasterGain = master;
      this.musicWarmFilter = filter;
      this.musicDelaySend = delaySend;
    }

    // 2. Ambient bus (lush warm chord pads + silky low-passed atmospheric air bed)
    if (!this.ambientMasterGain || !this.ambientWarmFilter) {
      const ambMaster = ctx.createGain();
      ambMaster.gain.setValueAtTime(0, now);

      const ambFilter = ctx.createBiquadFilter();
      ambFilter.type = 'lowpass';
      ambFilter.frequency.setValueAtTime(980, now);
      ambFilter.Q.setValueAtTime(0.55, now);

      const ambLfo = ctx.createOscillator();
      const ambLfoGain = ctx.createGain();
      ambLfo.type = 'sine';
      ambLfo.frequency.setValueAtTime(0.09, now);
      ambLfoGain.gain.setValueAtTime(180, now);
      ambLfo.connect(ambLfoGain);
      ambLfoGain.connect(ambFilter.frequency);
      ambLfo.start();

      ambFilter.connect(ambMaster);
      ambMaster.connect(ctx.destination);

      // Gentle looping brown-filtered cosmic/vinyl air texture on the Ambient bus
      if (!this.ambientAirStarted) {
        this.ambientAirStarted = true;
        const bufLen = Math.floor(ctx.sampleRate * 3.0);
        const airBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = airBuf.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufLen; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + 0.025 * white) / 1.025;
          data[i] = lastOut * 2.2;
        }

        const airSrc = ctx.createBufferSource();
        airSrc.buffer = airBuf;
        airSrc.loop = true;

        const airFilter = ctx.createBiquadFilter();
        airFilter.type = 'bandpass';
        airFilter.frequency.setValueAtTime(420, now);
        airFilter.Q.setValueAtTime(0.65, now);

        const airGain = ctx.createGain();
        airGain.gain.setValueAtTime(0.032, now);

        airSrc.connect(airFilter);
        airFilter.connect(airGain);
        airGain.connect(ambFilter);
        airSrc.start(now);
        this.ambientAirGain = airGain;
      }

      this.ambientMasterGain = ambMaster;
      this.ambientWarmFilter = ambFilter;
    }
  }

  private scheduleMusicStep(
    ctx: AudioContext,
    stepIdx: number,
    time: number
  ): void {
    if (
      !this.musicWarmFilter ||
      !this.musicDelaySend ||
      !this.ambientWarmFilter
    ) {
      return;
    }

    const barIndex = Math.floor(stepIdx / STEPS_PER_BAR) % LOFI_CHORDS.length;
    const stepInBar = stepIdx % STEPS_PER_BAR;
    const chord = LOFI_CHORDS[barIndex];
    const barDuration = STEPS_PER_BAR * STEP_DURATION_SEC;

    // 1. Ambient bus: Lush lo-fi pad chord at the start of each bar
    if (stepInBar === 0 && this.volumes.ambient > 0.001) {
      chord.pad.forEach((freq, voiceIdx) => {
        if (!this.ambientWarmFilter) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = voiceIdx % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime((voiceIdx - 2) * 5.5, time);

        const voicePeak = voiceIdx < 2 ? 0.058 : 0.038;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(voicePeak, time + 0.45);
        gain.gain.setValueAtTime(voicePeak * 0.85, time + barDuration - 0.55);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + barDuration + 0.25);

        osc.connect(gain);
        gain.connect(this.ambientWarmFilter);
        osc.start(time);
        osc.stop(time + barDuration + 0.3);
      });
    }

    if (this.volumes.music <= 0.001) return;

    // 2. Music bus: Warm sub-bass pulse on beat 1 and chill syncopated beat 6
    if (stepInBar === 0 || stepInBar === 5) {
      const dur =
        stepInBar === 0 ? STEP_DURATION_SEC * 3.8 : STEP_DURATION_SEC * 2.2;
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(chord.bass, time);

      const peak = stepInBar === 0 ? 0.14 : 0.1;
      bassGain.gain.setValueAtTime(0.0001, time);
      bassGain.gain.linearRampToValueAtTime(peak, time + 0.035);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      bassOsc.connect(bassGain);
      bassGain.connect(this.musicWarmFilter);
      bassOsc.start(time);
      bassOsc.stop(time + dur + 0.05);
    }

    // 3. Music bus: Soft Rhodes/bell melody plucks on chill off-beats
    if (
      stepInBar === 1 ||
      stepInBar === 3 ||
      stepInBar === 4 ||
      stepInBar === 6
    ) {
      const arpSlot =
        stepInBar === 1 ? 0 : stepInBar === 3 ? 1 : stepInBar === 4 ? 2 : 3;
      const skip = barIndex % 2 === 1 && stepInBar === 4;
      if (!skip) {
        const freq = chord.arp[arpSlot];
        const pluckOsc = ctx.createOscillator();
        const pluckGain = ctx.createGain();
        pluckOsc.type = 'sine';
        pluckOsc.frequency.setValueAtTime(freq, time);
        pluckOsc.detune.setValueAtTime(((stepIdx % 5) - 2) * 3, time);

        pluckGain.gain.setValueAtTime(0.0001, time);
        pluckGain.gain.linearRampToValueAtTime(0.048, time + 0.018);
        pluckGain.gain.exponentialRampToValueAtTime(0.0001, time + 1.05);

        pluckOsc.connect(pluckGain);
        pluckGain.connect(this.musicWarmFilter);
        pluckGain.connect(this.musicDelaySend);
        pluckOsc.start(time);
        pluckOsc.stop(time + 1.1);
      }
    }
  }

  private updateLoopGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const loopActive = !this.muted && this.musicWanted;

    if (this.musicMasterGain) {
      const targetMusic = loopActive ? this.volumes.music * MUSIC_TARGET_GAIN : 0;
      this.musicMasterGain.gain.cancelScheduledValues(now);
      this.musicMasterGain.gain.setValueAtTime(
        this.musicMasterGain.gain.value,
        now
      );
      this.musicMasterGain.gain.linearRampToValueAtTime(targetMusic, now + 0.08);
    }

    if (this.ambientMasterGain) {
      const targetAmbient = loopActive
        ? this.volumes.ambient * AMBIENT_TARGET_GAIN
        : 0;
      this.ambientMasterGain.gain.cancelScheduledValues(now);
      this.ambientMasterGain.gain.setValueAtTime(
        this.ambientMasterGain.gain.value,
        now
      );
      this.ambientMasterGain.gain.linearRampToValueAtTime(
        targetAmbient,
        now + 0.08
      );
    }

    if (this.ambientAirGain) {
      this.ambientAirGain.gain.setTargetAtTime(
        loopActive ? 0.032 : 0,
        now,
        0.06
      );
    }
  }

  private startMusicScheduler(): void {
    if (this.muted || !this.musicWanted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.ensureLoopGraphs(ctx);
    const now = ctx.currentTime;

    if (this.musicMasterGain) {
      this.musicMasterGain.gain.cancelScheduledValues(now);
      this.musicMasterGain.gain.setValueAtTime(
        this.musicMasterGain.gain.value,
        now
      );
      this.musicMasterGain.gain.linearRampToValueAtTime(
        this.volumes.music * MUSIC_TARGET_GAIN,
        now + 0.35
      );
    }

    if (this.ambientMasterGain) {
      this.ambientMasterGain.gain.cancelScheduledValues(now);
      this.ambientMasterGain.gain.setValueAtTime(
        this.ambientMasterGain.gain.value,
        now
      );
      this.ambientMasterGain.gain.linearRampToValueAtTime(
        this.volumes.ambient * AMBIENT_TARGET_GAIN,
        now + 0.35
      );
    }

    if (this.ambientAirGain) {
      this.ambientAirGain.gain.setTargetAtTime(0.032, now, 0.15);
    }

    if (this.musicTimerId !== null) return;

    const gen = this.musicGeneration;
    this.musicNextStepTime = Math.max(now + 0.05, this.musicNextStepTime);

    this.musicTimerId = window.setInterval(() => {
      if (this.muted || !this.musicWanted || gen !== this.musicGeneration) {
        this.stopMusicScheduler();
        return;
      }
      if (!this.ctx || this.ctx.state !== 'running') return;

      const lookAhead = 0.28;
      if (this.musicNextStepTime < this.ctx.currentTime - 0.5) {
        this.musicNextStepTime = this.ctx.currentTime + 0.04;
      }

      while (this.musicNextStepTime < this.ctx.currentTime + lookAhead) {
        this.scheduleMusicStep(
          this.ctx,
          this.musicStepIndex,
          this.musicNextStepTime
        );
        this.musicNextStepTime += STEP_DURATION_SEC;
        this.musicStepIndex =
          (this.musicStepIndex + 1) % (LOFI_CHORDS.length * STEPS_PER_BAR);
      }
    }, 90);
  }

  private stopMusicScheduler(): void {
    if (this.musicTimerId !== null) {
      window.clearInterval(this.musicTimerId);
      this.musicTimerId = null;
    }
    this.musicGeneration += 1;

    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.musicMasterGain) {
        this.musicMasterGain.gain.cancelScheduledValues(now);
        this.musicMasterGain.gain.setValueAtTime(
          this.musicMasterGain.gain.value,
          now
        );
        this.musicMasterGain.gain.linearRampToValueAtTime(0, now + 0.16);
      }
      if (this.ambientMasterGain) {
        this.ambientMasterGain.gain.cancelScheduledValues(now);
        this.ambientMasterGain.gain.setValueAtTime(
          this.ambientMasterGain.gain.value,
          now
        );
        this.ambientMasterGain.gain.linearRampToValueAtTime(0, now + 0.16);
      }
    }
  }

  public getVolumes(): AudioVolumeSettings {
    return { ...this.volumes };
  }

  public setChannelVolume(channel: AudioChannel, value: number): void {
    const nextVal = clampUnit(value);
    this.volumes = {
      ...this.volumes,
      [channel]: nextVal,
    };
    this.saveVolumes();

    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (channel === 'sfx' && this.sfxMasterGain) {
        this.sfxMasterGain.gain.setTargetAtTime(
          this.muted ? 0 : nextVal,
          now,
          0.02
        );
      } else {
        this.updateLoopGains();
      }
    }
  }

  public resetVolumes(): AudioVolumeSettings {
    this.volumes = { ...DEFAULT_AUDIO_VOLUMES };
    this.saveVolumes();
    if (this.ctx) {
      if (this.sfxMasterGain) {
        this.sfxMasterGain.gain.setTargetAtTime(
          this.muted ? 0 : this.volumes.sfx,
          this.ctx.currentTime,
          0.02
        );
      }
      this.updateLoopGains();
    }
    return this.getVolumes();
  }

  public startAmbientMusic(): void {
    this.musicWanted = true;
    if (!this.muted) {
      this.startMusicScheduler();
    }
  }

  public stopAmbientMusic(): void {
    this.musicWanted = false;
    this.stopMusicScheduler();
  }

  public pauseAmbientMusic(): void {
    this.stopMusicScheduler();
  }

  public resumeAmbientMusicIfActive(): void {
    if (this.musicWanted && !this.muted) {
      this.startMusicScheduler();
    }
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && this.musicWanted && !this.muted) {
      this.startMusicScheduler();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, String(muted));
    } catch {
      // Ignore storage errors
    }

    if (this.ctx && this.sfxMasterGain) {
      this.sfxMasterGain.gain.setTargetAtTime(
        muted ? 0 : this.volumes.sfx,
        this.ctx.currentTime,
        0.02
      );
    }

    if (muted) {
      this.stopMusicScheduler();
    } else if (this.musicWanted) {
      this.startMusicScheduler();
    }
  }

  public previewSfx(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playBlockHit(combo: number): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    if (now - this.lastHitTime < 0.022) return;
    this.lastHitTime = now;

    const semitones = Math.min(combo, 28) * 0.55;
    const freq = 290 * Math.pow(2, semitones / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.045);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.095, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playBlockDestroy(multiplier = 1): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const semitoneBoost = Math.min(Math.max(0, multiplier - 1), 10) * 1.1;
    const pitchScale = Math.pow(2, semitoneBoost / 12);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 * pitchScale, now);
    osc.frequency.exponentialRampToValueAtTime(160 * pitchScale, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playWallBounce(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    if (now - this.lastWallTime < 0.04) return;
    this.lastWallTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.03);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playPickup(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const freqs = [587.33, 880];

    freqs.forEach((f, idx) => {
      const start = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

      osc.connect(gain);
      gain.connect(out);

      osc.start(start);
      osc.stop(start + 0.13);
    });
  }

  public playMultiBall(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];

    freqs.forEach((f, idx) => {
      const start = now + idx * 0.03;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);

      osc.connect(gain);
      gain.connect(out);

      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  public playBombExplosion(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.24);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.28);

    const bufferSize = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.2);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(out);

    noise.start(now);
    noise.stop(now + 0.21);
  }

  public playLaunch(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.05);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(out);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playGameOver(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const notes = [330, 277.18, 220];

    notes.forEach((f, idx) => {
      const start = now + idx * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      osc.frequency.exponentialRampToValueAtTime(f * 0.94, start + 0.22);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);

      osc.connect(gain);
      gain.connect(out);

      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  public playMissionComplete(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((f, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

      osc.connect(gain);
      gain.connect(out);

      osc.start(start);
      osc.stop(start + 0.21);
    });
  }

  public playShieldGain(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const notes = [392, 523.25, 783.99];
    notes.forEach((f, idx) => {
      const start = now + idx * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);

      osc.connect(gain);
      gain.connect(out);

      osc.start(start);
      osc.stop(start + 0.17);
    });
  }

  public playShieldTrigger(): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;

    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = 'triangle';
    sweep.frequency.setValueAtTime(640, now);
    sweep.frequency.exponentialRampToValueAtTime(140, now + 0.28);

    sweepGain.gain.setValueAtTime(0.001, now);
    sweepGain.gain.linearRampToValueAtTime(0.16, now + 0.012);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    sweep.connect(sweepGain);
    sweepGain.connect(out);
    sweep.start(now);
    sweep.stop(now + 0.31);

    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, now + 0.03);
    chime.frequency.exponentialRampToValueAtTime(1174.66, now + 0.22);

    chimeGain.gain.setValueAtTime(0.001, now + 0.03);
    chimeGain.gain.linearRampToValueAtTime(0.09, now + 0.045);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    chime.connect(chimeGain);
    chimeGain.connect(out);
    chime.start(now + 0.03);
    chime.stop(now + 0.26);
  }

  public playStageUp(stage: number): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    const pitchBoost = Math.pow(2, Math.min(6, Math.max(0, stage - 2)) / 12);
    const notes = [440, 554.37, 659.25, 880].map((f) => f * pitchBoost);

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.connect(gain);
      gain.connect(out);

      osc.start(start);
      osc.stop(start + 0.19);
    });
  }

  private getVoiceNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.voiceNoiseBuffer && this.voiceNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.voiceNoiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.voiceNoiseBuffer = buffer;
    return buffer;
  }

  private scheduleNoiseConsonant(
    ctx: AudioContext,
    out: AudioNode,
    startTime: number,
    duration: number,
    centerFreq: number,
    peakGain: number
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = this.getVoiceNoiseBuffer(ctx);
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startTime);
    filter.Q.setValueAtTime(3.2, startTime);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.012, duration * 0.35));
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(out);

    src.start(startTime);
    src.stop(startTime + duration + 0.015);
  }

  private scheduleFormantSyllable(
    ctx: AudioContext,
    out: AudioNode,
    baseTime: number,
    syl: FormantSyllable
  ): void {
    const t0 = baseTime + syl.offset;
    const t1 = t0 + syl.duration;

    if (syl.preBurstFreq && syl.preBurstDur) {
      this.scheduleNoiseConsonant(
        ctx,
        out,
        Math.max(ctx.currentTime, t0 - syl.preBurstDur * 0.55),
        syl.preBurstDur,
        syl.preBurstFreq,
        syl.preBurstGain ?? 0.065
      );
    }

    // Glottal pulse source (sawtooth + subtle octave triangle for crisp vocoder articulation)
    const glottal = ctx.createOscillator();
    glottal.type = 'sawtooth';
    glottal.frequency.setValueAtTime(syl.f0Start, t0);
    glottal.frequency.exponentialRampToValueAtTime(syl.f0End, t1);

    const harmonic = ctx.createOscillator();
    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(syl.f0Start * 2, t0);
    harmonic.frequency.exponentialRampToValueAtTime(syl.f0End * 2, t1);

    const glottalMix = ctx.createGain();
    glottalMix.gain.setValueAtTime(0.75, t0);
    const harmonicMix = ctx.createGain();
    harmonicMix.gain.setValueAtTime(0.24, t0);

    // Dual parallel vowel formant resonators (F1 + F2)
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.Q.setValueAtTime(5.2, t0);
    f1.frequency.setValueAtTime(syl.f1Start, t0);
    f1.frequency.exponentialRampToValueAtTime(syl.f1End, t1);

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.Q.setValueAtTime(7.0, t0);
    f2.frequency.setValueAtTime(syl.f2Start, t0);
    f2.frequency.exponentialRampToValueAtTime(syl.f2End, t1);

    const f1Gain = ctx.createGain();
    f1Gain.gain.setValueAtTime(1.1, t0);
    const f2Gain = ctx.createGain();
    f2Gain.gain.setValueAtTime(0.85, t0);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(syl.gain, t0 + Math.min(0.022, syl.duration * 0.25));
    env.gain.setValueAtTime(syl.gain * 0.9, t0 + syl.duration * 0.68);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);

    glottal.connect(glottalMix);
    harmonic.connect(harmonicMix);
    glottalMix.connect(f1);
    glottalMix.connect(f2);
    harmonicMix.connect(f1);
    harmonicMix.connect(f2);

    f1.connect(f1Gain);
    f2.connect(f2Gain);
    f1Gain.connect(env);
    f2Gain.connect(env);
    env.connect(out);

    glottal.start(t0);
    harmonic.start(t0);
    glottal.stop(t1 + 0.02);
    harmonic.stop(t1 + 0.02);

    if (syl.postBurstFreq && syl.postBurstDur) {
      this.scheduleNoiseConsonant(
        ctx,
        out,
        t1 - syl.postBurstDur * 0.25,
        syl.postBurstDur,
        syl.postBurstFreq,
        syl.postBurstGain ?? 0.06
      );
    }
  }

  /**
   * Triggers short synthesized formant 'voice' feedback for escalated combo tiers:
   * - Tier 1 (4-5 hits): "Nice!"
   * - Tier 2 (6-8 hits): "Awesome!"
   * - Tier 3 (9-11 hits): "Super!"
   * - Tier 4 (12+ hits): "Prism-tastic!"
   */
  public playComboVoice(tier: ComboVoiceTier): void {
    const sfx = this.ensureSfxContext();
    if (!sfx) return;
    const { ctx, out } = sfx;

    const now = ctx.currentTime;
    if (now - this.lastVoiceTime < 0.48) return;
    this.lastVoiceTime = now;

    // Gentle voice bus compressor/limiter level so multi-formants stay warm and punchy
    const voiceBus = ctx.createGain();
    voiceBus.gain.setValueAtTime(1.0, now);
    voiceBus.connect(out);

    let phrase: FormantSyllable[];
    let accentNotes: number[];

    if (tier === 1) {
      // "Nice!" — /n/ nasal lead into rising /aɪ/ + crisp /s/
      phrase = [
        {
          offset: 0,
          duration: 0.055,
          f0Start: 185,
          f0End: 205,
          f1Start: 300,
          f1End: 460,
          f2Start: 1150,
          f2End: 1220,
          gain: 0.14,
        },
        {
          offset: 0.048,
          duration: 0.19,
          f0Start: 205,
          f0End: 258,
          f1Start: 740,
          f1End: 410,
          f2Start: 1120,
          f2End: 2220,
          gain: 0.2,
          postBurstFreq: 5600,
          postBurstDur: 0.07,
          postBurstGain: 0.05,
        },
      ];
      accentNotes = [587.33, 880];
    } else if (tier === 2) {
      // "Awesome!" — bold /ɔː/ + /səm/
      phrase = [
        {
          offset: 0,
          duration: 0.14,
          f0Start: 215,
          f0End: 265,
          f1Start: 620,
          f1End: 540,
          f2Start: 880,
          f2End: 960,
          gain: 0.22,
          postBurstFreq: 4800,
          postBurstDur: 0.05,
          postBurstGain: 0.055,
        },
        {
          offset: 0.155,
          duration: 0.155,
          f0Start: 245,
          f0End: 222,
          f1Start: 490,
          f1End: 340,
          f2Start: 1320,
          f2End: 1060,
          gain: 0.19,
        },
      ];
      accentNotes = [659.25, 987.77, 1318.51];
    } else if (tier === 3) {
      // "Super!" — crisp /suː/ + /pɚ/
      phrase = [
        {
          offset: 0,
          duration: 0.125,
          f0Start: 230,
          f0End: 278,
          f1Start: 350,
          f1End: 320,
          f2Start: 1020,
          f2End: 880,
          gain: 0.21,
          preBurstFreq: 5400,
          preBurstDur: 0.06,
          preBurstGain: 0.06,
        },
        {
          offset: 0.14,
          duration: 0.16,
          f0Start: 268,
          f0End: 305,
          f1Start: 480,
          f1End: 520,
          f2Start: 1380,
          f2End: 1620,
          gain: 0.22,
          preBurstFreq: 1900,
          preBurstDur: 0.028,
          preBurstGain: 0.055,
        },
      ];
      accentNotes = [783.99, 1046.5, 1567.98];
    } else {
      // "Prism-tastic!" — energetic 4-beat vocoder cadence
      phrase = [
        {
          offset: 0,
          duration: 0.095,
          f0Start: 225,
          f0End: 255,
          f1Start: 410,
          f1End: 380,
          f2Start: 1920,
          f2End: 2050,
          gain: 0.21,
          preBurstFreq: 2100,
          preBurstDur: 0.03,
          preBurstGain: 0.06,
          postBurstFreq: 4200,
          postBurstDur: 0.038,
          postBurstGain: 0.04,
        },
        {
          offset: 0.105,
          duration: 0.08,
          f0Start: 245,
          f0End: 262,
          f1Start: 520,
          f1End: 360,
          f2Start: 1220,
          f2End: 1080,
          gain: 0.18,
        },
        {
          offset: 0.195,
          duration: 0.13,
          f0Start: 268,
          f0End: 308,
          f1Start: 720,
          f1End: 650,
          f2Start: 1740,
          f2End: 1860,
          gain: 0.23,
          preBurstFreq: 3400,
          preBurstDur: 0.028,
          preBurstGain: 0.06,
          postBurstFreq: 5200,
          postBurstDur: 0.048,
          postBurstGain: 0.055,
        },
        {
          offset: 0.34,
          duration: 0.145,
          f0Start: 295,
          f0End: 345,
          f1Start: 420,
          f1End: 380,
          f2Start: 1980,
          f2End: 2180,
          gain: 0.23,
          preBurstFreq: 3500,
          preBurstDur: 0.025,
          preBurstGain: 0.055,
          postBurstFreq: 2800,
          postBurstDur: 0.03,
          postBurstGain: 0.05,
        },
      ];
      accentNotes = [783.99, 987.77, 1174.66, 1567.98];
    }

    for (const syl of phrase) {
      this.scheduleFormantSyllable(ctx, voiceBus, now, syl);
    }

    // Subtle arcade synth sparkle underline matching the tier excitement
    accentNotes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.036, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain);
      gain.connect(voiceBus);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }
}

export const soundEngine = new SoundEngine();
