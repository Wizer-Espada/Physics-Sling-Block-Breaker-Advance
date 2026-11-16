import type { PickupType } from './types.ts';

class HapticsEngine {
  private lastHitAt = 0;
  private lastDestroyAt = 0;
  private priorityUntil = 0;

  private canVibrate(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }
    if (typeof navigator.vibrate !== 'function') {
      return false;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return true;
  }

  private trigger(pattern: number | number[], priorityDurationMs = 0): void {
    if (!this.canVibrate()) return;
    const now = performance.now();

    if (priorityDurationMs === 0 && now < this.priorityUntil) {
      return;
    }

    if (priorityDurationMs > 0) {
      this.priorityUntil = now + priorityDurationMs;
    }

    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore browser gesture or unsupported-device errors
    }
  }

  public blockHit(): void {
    const now = performance.now();
    if (now - this.lastHitAt < 45) return;
    this.lastHitAt = now;
    this.trigger(8);
  }

  public blockDestroy(): void {
    const now = performance.now();
    if (now - this.lastDestroyAt < 65) return;
    this.lastDestroyAt = now;
    this.trigger([14, 18, 10], 45);
  }

  public pickup(type: PickupType): void {
    if (type === 'extra_ball') {
      this.trigger([12, 24, 16], 55);
      return;
    }
    if (type === 'multi_ball') {
      this.trigger([12, 20, 14, 20, 22], 95);
      return;
    }
    if (type === 'shield') {
      this.trigger([16, 22, 24], 80);
      return;
    }
    // Bomb explosion haptic
    this.trigger([38, 26, 22, 18, 12], 125);
  }

  public shieldTrigger(): void {
    this.trigger([30, 22, 46, 20, 24], 180);
  }

  public gameOver(): void {
    this.trigger([45, 40, 35, 45, 70], 240);
  }

  public cancel(): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return;
    }
    this.priorityUntil = 0;
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore errors
    }
  }
}

export const hapticsEngine = new HapticsEngine();
