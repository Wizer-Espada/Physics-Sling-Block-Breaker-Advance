import { getBlockColors, getChainMultiplierColor } from './colors.ts';
import {
  BALL_RADIUS,
  BALL_SPEED,
  DANGER_ROW,
  DANGER_Y,
  FLOOR_Y,
  GameState,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from './types.ts';

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  rotation: number,
  stretch = 1
): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const theta = rotation + (i * Math.PI * 2) / sides;
    const rx = Math.cos(theta) * radius * (i % 2 === 0 ? stretch : 1);
    const ry = Math.sin(theta) * radius;
    const px = x + rx;
    const py = y + ry;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawShieldIcon(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.lineTo(r * 0.82, -r * 0.55);
  ctx.lineTo(r * 0.72, r * 0.2);
  ctx.quadraticCurveTo(0, r * 0.95, 0, r * 1.02);
  ctx.quadraticCurveTo(0, r * 0.95, -r * 0.72, r * 0.2);
  ctx.lineTo(-r * 0.82, -r * 0.55);
  ctx.closePath();
}

function toAlphaColor(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha)).toFixed(3);
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
  }
  if (color.startsWith('hsl(')) {
    return color.replace('hsl(', 'hsla(').replace(')', `, ${a})`);
  }
  if (color.startsWith('hsla(')) {
    return color.replace(/,\s*[\d.]+\)$/, `, ${a})`);
  }
  return color;
}

interface TrackedBlockInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface ExplosionSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  coreColor: string;
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
  twinklePhase: number;
}

interface ExplosionFlash {
  x: number;
  y: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
}

interface ExplosionTracker {
  lastTimeMs: number;
  lastBlocksDestroyed: number;
  prevBlocks: Map<number, TrackedBlockInfo>;
  sparks: ExplosionSpark[];
  flashes: ExplosionFlash[];
}

const MAX_RENDERER_SPARKS = 320;
const MAX_RENDERER_FLASHES = 24;
const PRISM_SPARK_PALETTE = [
  '#fde047', // Solar yellow
  '#38bdf8', // Electric cyan
  '#f472b6', // Hot magenta
  '#34d399', // Emerald mint
  '#fb923c', // Ember orange
  '#c084fc', // Prism violet
];

const explosionTrackers = new WeakMap<GameState, ExplosionTracker>();

function createExplosionTracker(state: GameState, nowMs: number): ExplosionTracker {
  const prevBlocks = new Map<number, TrackedBlockInfo>();
  for (const b of state.blocks) {
    if (b.hp > 0) {
      prevBlocks.set(b.id, {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        color: getBlockColors(b.hp).stroke,
      });
    }
  }
  return {
    lastTimeMs: nowMs,
    lastBlocksDestroyed: state.blocksDestroyed,
    prevBlocks,
    sparks: [],
    flashes: [],
  };
}

function triggerBrickSparkExplosion(
  tracker: ExplosionTracker,
  block: TrackedBlockInfo,
  prefersReducedMotion: boolean
): void {
  const cx = block.x + block.width / 2;
  const cy = block.y + block.height / 2;

  if (tracker.flashes.length >= MAX_RENDERER_FLASHES) {
    tracker.flashes.shift();
  }
  tracker.flashes.push({
    x: cx,
    y: cy,
    radius: block.width * 0.95,
    color: block.color,
    life: prefersReducedMotion ? 0.16 : 0.24,
    maxLife: prefersReducedMotion ? 0.16 : 0.24,
  });

  const sparkCount = prefersReducedMotion ? 8 : 22;
  const paletteOffset = Math.floor(Math.random() * PRISM_SPARK_PALETTE.length);

  for (let i = 0; i < sparkCount; i++) {
    if (tracker.sparks.length >= MAX_RENDERER_SPARKS) {
      tracker.sparks.shift();
    }

    const baseAngle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.42;
    const speed = prefersReducedMotion
      ? 35 + Math.random() * 55
      : 130 + Math.random() * 290;
    const maxLife = prefersReducedMotion
      ? 0.22 + Math.random() * 0.12
      : 0.38 + Math.random() * 0.34;

    // Blend brick's neon hue with multi-color prism sparks for rich visual punch
    const useBrickColor = i % 3 === 0;
    const color = useBrickColor
      ? block.color
      : PRISM_SPARK_PALETTE[(paletteOffset + i) % PRISM_SPARK_PALETTE.length];

    tracker.sparks.push({
      x: cx + (Math.random() - 0.5) * block.width * 0.45,
      y: cy + (Math.random() - 0.5) * block.height * 0.45,
      vx: Math.cos(baseAngle) * speed,
      vy: Math.sin(baseAngle) * speed - (prefersReducedMotion ? 0 : 40),
      size: 1.6 + Math.random() * 2.1,
      color,
      coreColor: i % 2 === 0 ? '#ffffff' : '#fef9c3',
      life: maxLife,
      maxLife,
      drag: 2.6 + Math.random() * 1.4,
      gravity: prefersReducedMotion ? 0 : 280,
      twinklePhase: Math.random() * Math.PI * 2,
    });
  }
}

function updateAndRenderBrickExplosions(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  prefersReducedMotion: boolean
): void {
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let tracker = explosionTrackers.get(state);
  if (!tracker) {
    tracker = createExplosionTracker(state, nowMs);
    explosionTrackers.set(state, tracker);
  }

  const dt = Math.min(0.05, Math.max(0.001, (nowMs - tracker.lastTimeMs) / 1000));
  tracker.lastTimeMs = nowMs;

  // Detect any bricks destroyed since the previous render frame
  const activeBlockIds = new Set<number>();
  for (const b of state.blocks) {
    if (b.hp > 0) {
      activeBlockIds.add(b.id);
    }
  }

  if (state.blocksDestroyed > tracker.lastBlocksDestroyed) {
    for (const [id, prevBlock] of tracker.prevBlocks.entries()) {
      if (!activeBlockIds.has(id)) {
        triggerBrickSparkExplosion(tracker, prevBlock, prefersReducedMotion);
      }
    }
  }
  tracker.lastBlocksDestroyed = state.blocksDestroyed;

  tracker.prevBlocks.clear();
  for (const b of state.blocks) {
    if (b.hp > 0) {
      tracker.prevBlocks.set(b.id, {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        color: getBlockColors(b.hp).stroke,
      });
    }
  }

  // Advance flashes
  for (let i = tracker.flashes.length - 1; i >= 0; i--) {
    const f = tracker.flashes[i];
    f.life -= dt;
    if (f.life <= 0) {
      tracker.flashes.splice(i, 1);
    }
  }

  // Advance colorful fading sparks
  for (let i = tracker.sparks.length - 1; i >= 0; i--) {
    const s = tracker.sparks[i];
    s.life -= dt;
    if (s.life <= 0) {
      tracker.sparks.splice(i, 1);
      continue;
    }

    const damping = Math.exp(-s.drag * dt);
    s.vx *= damping;
    s.vy = s.vy * damping + s.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.twinklePhase += dt * 24;

    if (s.x < 2) {
      s.x = 2;
      s.vx = Math.abs(s.vx) * 0.55;
    } else if (s.x > LOGICAL_WIDTH - 2) {
      s.x = LOGICAL_WIDTH - 2;
      s.vx = -Math.abs(s.vx) * 0.55;
    }
    if (s.y > FLOOR_Y - 2) {
      s.y = FLOOR_Y - 2;
      s.vy = -Math.abs(s.vy) * 0.45;
      s.vx *= 0.8;
    }
  }

  if (tracker.flashes.length === 0 && tracker.sparks.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Core radial explosion blooms
  for (const f of tracker.flashes) {
    const t = Math.max(0, f.life / f.maxLife);
    const radius = f.radius * (1.15 - t * 0.45);
    const grad = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, radius);
    grad.addColorStop(0, `rgba(255, 255, 255, ${(t * 0.65).toFixed(2)})`);
    grad.addColorStop(0.45, f.color);
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.globalAlpha = t * 0.72;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Colorful fading spark streaks
  ctx.lineCap = 'round';
  for (const s of tracker.sparks) {
    const lifeRatio = Math.max(0, s.life / s.maxLife);
    const fade = Math.pow(lifeRatio, 0.72);
    const twinkle = prefersReducedMotion ? 1 : 0.78 + 0.22 * Math.sin(s.twinklePhase);
    const alpha = fade * twinkle;

    const speed = Math.hypot(s.vx, s.vy);
    const streakLen = prefersReducedMotion ? s.size * 1.4 : Math.min(18, Math.max(s.size * 1.5, speed * 0.042));
    const ux = speed > 1 ? s.vx / speed : 0;
    const uy = speed > 1 ? s.vy / speed : -1;
    const tailX = s.x - ux * streakLen;
    const tailY = s.y - uy * streakLen;

    // Outer colorful halo streak
    ctx.globalAlpha = alpha * 0.78;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size * (1.2 + lifeRatio * 0.7);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    // Hot luminous inner spark filament
    ctx.globalAlpha = alpha * 0.95;
    ctx.strokeStyle = s.coreColor;
    ctx.lineWidth = Math.max(0.9, s.size * 0.55);
    ctx.beginPath();
    ctx.moveTo(s.x - ux * streakLen * 0.55, s.y - uy * streakLen * 0.55);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  }

  ctx.restore();
}

export function renderGame(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.save();

  // Dark neon minimalist canvas backdrop (#0f172a) with overscan to prevent edge gaps during shake
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-16, -16, LOGICAL_WIDTH + 32, LOGICAL_HEIGHT + 32);

  // Trauma-based camera shake + directional impact kick on block breaks & bomb blasts
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion && (state.shakeTrauma > 0.005 || Math.abs(state.shakeKickX) > 0.05 || Math.abs(state.shakeKickY) > 0.05)) {
    const traumaSq = state.shakeTrauma * state.shakeTrauma;
    const maxOffset = 9.5 * traumaSq;
    const sx = (Math.random() * 2 - 1) * maxOffset + state.shakeKickX;
    const sy = (Math.random() * 2 - 1) * maxOffset + state.shakeKickY;
    const rot = (Math.random() * 2 - 1) * 0.008 * traumaSq;

    ctx.translate(LOGICAL_WIDTH / 2 + sx, LOGICAL_HEIGHT / 2 + sy);
    ctx.rotate(rot);
    ctx.translate(-LOGICAL_WIDTH / 2, -LOGICAL_HEIGHT / 2);
  }

  // Subtle tactical grid lines that shift tint slightly at higher stages
  ctx.strokeStyle =
    state.difficultyTier >= 5
      ? 'rgba(251, 191, 36, 0.065)'
      : state.difficultyTier >= 3
        ? 'rgba(56, 189, 248, 0.06)'
        : 'rgba(148, 163, 184, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 60; x < LOGICAL_WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FLOOR_Y);
    ctx.stroke();
  }
  for (let y = 44; y < FLOOR_Y; y += 58) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LOGICAL_WIDTH, y);
    ctx.stroke();
  }

  // Danger line threshold & Aegis Shield energy barrier
  const nearDanger = state.blocks.some((b) => b.row === DANGER_ROW - 1);
  ctx.save();
  if (state.shields > 0) {
    const pulse = prefersReducedMotion
      ? 0.5
      : 0.5 + 0.5 * Math.sin(state.multiplierHudPhase * 3.2);
    const barLeft = 12;
    const barRight = LOGICAL_WIDTH - 12;

    const isExpanded = state.buffShieldExpandTurns > 0;
    const fieldTop = isExpanded ? DANGER_Y - 22 : DANGER_Y - 7;
    const fieldHeight = isExpanded ? 29 : 14;

    // Subtle glowing energy corridor along the danger line (expands upward during Shield Expansion)
    const grad = ctx.createLinearGradient(0, fieldTop, 0, fieldTop + fieldHeight);
    grad.addColorStop(0, 'rgba(129, 140, 248, 0)');
    grad.addColorStop(
      0.5,
      isExpanded || state.shields >= 2
        ? `rgba(129, 140, 248, ${(isExpanded ? 0.34 : 0.22 + pulse * 0.08).toFixed(2)})`
        : `rgba(56, 189, 248, ${(0.18 + pulse * 0.08).toFixed(2)})`
    );
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(barLeft, fieldTop, barRight - barLeft, fieldHeight);

    // Upper expansion rail when Shield Expansion buff is active
    if (isExpanded) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(129, 140, 248, 0.75)';
      ctx.strokeStyle = 'rgba(165, 180, 252, 0.85)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(barLeft, DANGER_Y - 18);
      ctx.lineTo(barRight, DANGER_Y - 18);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Primary luminous Aegis barrier beam
    ctx.shadowColor =
      isExpanded || state.shields >= 2
        ? 'rgba(129, 140, 248, 0.88)'
        : 'rgba(56, 189, 248, 0.8)';
    ctx.shadowBlur = 10 + pulse * 4;
    ctx.strokeStyle = nearDanger
      ? '#60a5fa'
      : isExpanded || state.shields >= 2
        ? '#818cf8'
        : '#38bdf8';
    ctx.lineWidth = isExpanded ? 2.8 : state.shields >= 2 ? 2.4 : 1.8;
    ctx.beginPath();
    ctx.moveTo(barLeft, DANGER_Y);
    ctx.lineTo(barRight, DANGER_Y);
    ctx.stroke();

    // Secondary rail when stacked to 2+ shields
    if (state.shields >= 2 || isExpanded) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(barLeft, DANGER_Y + 3.5);
      ctx.lineTo(barRight, DANGER_Y + 3.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Wall anchor emitter nodes
    ctx.shadowBlur = 6;
    ctx.fillStyle = isExpanded ? '#c7d2fe' : '#bae6fd';
    for (const ax of [barLeft, barRight]) {
      drawPolygon(ctx, ax, DANGER_Y, isExpanded ? 5 : 4, 4, Math.PI / 4);
      ctx.fill();
      if (isExpanded) {
        drawPolygon(ctx, ax, DANGER_Y - 18, 3.5, 4, Math.PI / 4);
        ctx.fill();
      }
    }
  } else {
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = nearDanger
      ? 'rgba(244, 63, 94, 0.72)'
      : 'rgba(244, 63, 94, 0.25)';
    ctx.beginPath();
    ctx.moveTo(12, DANGER_Y);
    ctx.lineTo(LOGICAL_WIDTH - 12, DANGER_Y);
    ctx.stroke();
  }

  // Discharge / recharge barrier flash
  if (state.shieldFlashTimer > 0) {
    const flashAlpha = Math.min(1, state.shieldFlashTimer / 0.55);
    ctx.globalAlpha = flashAlpha;
    ctx.strokeStyle = '#e0f2fe';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3 + flashAlpha * 3;
    ctx.beginPath();
    ctx.moveTo(12, DANGER_Y);
    ctx.lineTo(LOGICAL_WIDTH - 12, DANGER_Y);
    ctx.stroke();
  }
  ctx.restore();

  // Floor baseline
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, FLOOR_Y);
  ctx.lineTo(LOGICAL_WIDTH - 12, FLOOR_Y);
  ctx.stroke();

  // Shockwaves
  for (const sw of state.shockwaves) {
    const alpha = Math.max(0, sw.life / sw.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Pass 1: Additive neon bloom halos behind all bricks & power-ups
  if (state.blocks.length > 0 || state.pickups.length > 0 || state.floatingBuffs.length > 0) {
    const ambientPulse = prefersReducedMotion
      ? 0.5
      : 0.5 + 0.5 * Math.sin(state.multiplierHudPhase * 3.8);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const block of state.blocks) {
      const isPowerup = block.kind === 'powerup';
      const isDanger = block.row === DANGER_ROW - 1;
      const isShieldBuff = block.powerupReward === 'shield_expansion';
      const palette = getBlockColors(block.hp);
      const bloomColor = isDanger
        ? '#fb7185'
        : isPowerup
          ? isShieldBuff
            ? '#818cf8'
            : '#38bdf8'
          : palette.stroke;

      const scaleBoost = 1 + block.hitScale * 0.08;
      const flashBoost = block.flashTimer > 0 ? Math.min(1, block.flashTimer / 0.1) : 0;
      const cx = block.x + block.width / 2;
      const cy = block.y + block.height / 2;
      const bloomRadius =
        Math.max(block.width, block.height) *
        (isPowerup ? 1.32 + ambientPulse * 0.14 : isDanger ? 1.24 : 1.12) *
        scaleBoost;

      const coreAlpha =
        (isPowerup ? 0.36 + ambientPulse * 0.1 : isDanger ? 0.34 : 0.25) + flashBoost * 0.34;
      const midAlpha = (isPowerup ? 0.16 : 0.11) + flashBoost * 0.16;

      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, bloomRadius);
      grad.addColorStop(0, toAlphaColor(bloomColor, coreAlpha));
      grad.addColorStop(0.5, toAlphaColor(bloomColor, midAlpha));
      grad.addColorStop(1, toAlphaColor(bloomColor, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, bloomRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pickup of state.pickups) {
      const pulse = 1 + Math.sin(pickup.pulsePhase) * 0.12;
      const color =
        pickup.type === 'extra_ball'
          ? '#34d399'
          : pickup.type === 'multi_ball'
            ? '#38bdf8'
            : pickup.type === 'shield'
              ? '#60a5fa'
              : '#fb923c';
      const bloomRadius = pickup.radius * (2.65 * pulse);
      const grad = ctx.createRadialGradient(pickup.x, pickup.y, 1, pickup.x, pickup.y, bloomRadius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
      grad.addColorStop(0.32, toAlphaColor(color, 0.42));
      grad.addColorStop(0.68, toAlphaColor(color, 0.14));
      grad.addColorStop(1, toAlphaColor(color, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, bloomRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const buff of state.floatingBuffs) {
      if (buff.collected) continue;
      const bobOffset = prefersReducedMotion ? 0 : Math.sin(buff.bobPhase) * 3.2;
      const blinkAlpha =
        buff.life < 2.2 ? 0.4 + 0.6 * Math.abs(Math.sin(buff.bobPhase * 3.2)) : 1;
      const isMulti = buff.type === 'multi_ball';
      const accent = isMulti ? '#38bdf8' : '#818cf8';
      const bloomRadius = buff.radius * 3.05;
      const by = buff.y + bobOffset;

      const grad = ctx.createRadialGradient(buff.x, by, 2, buff.x, by, bloomRadius);
      grad.addColorStop(0, 'rgba(253, 224, 71, 0.42)');
      grad.addColorStop(0.35, toAlphaColor(accent, 0.45));
      grad.addColorStop(0.72, toAlphaColor(accent, 0.16));
      grad.addColorStop(1, toAlphaColor(accent, 0));

      ctx.globalAlpha = blinkAlpha;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(buff.x, by, bloomRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Pass 2: High-contrast neon brick bodies & specular inner tubes
  for (const block of state.blocks) {
    const isPowerup = block.kind === 'powerup';
    const palette = getBlockColors(block.hp);
    const isDanger = block.row === DANGER_ROW - 1;
    const isShieldBuff = block.powerupReward === 'shield_expansion';
    const powerupStroke = isShieldBuff ? '#818cf8' : '#38bdf8';
    const strokeColor = isDanger
      ? '#fb7185'
      : isPowerup
        ? powerupStroke
        : palette.stroke;
    const scaleBoost = 1 + block.hitScale * 0.08;
    const isFlashing = block.flashTimer > 0;

    const cx = block.x + block.width / 2;
    const cy = block.y + block.height / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleBoost, scaleBoost);

    ctx.shadowColor = isFlashing
      ? 'rgba(255, 255, 255, 0.95)'
      : isDanger
        ? 'rgba(251, 113, 133, 0.85)'
        : isPowerup
          ? isShieldBuff
            ? 'rgba(129, 140, 248, 0.92)'
            : 'rgba(56, 189, 248, 0.92)'
          : toAlphaColor(palette.stroke, 0.82);
    ctx.shadowBlur = isFlashing ? 24 : isPowerup ? 20 : isDanger ? 18 : 14;

    if (block.shape === 'rect') {
      const halfW = block.width / 2;
      const halfH = block.height / 2;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, block.width, block.height, 8);

      if (isFlashing) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      } else {
        const bodyGrad = ctx.createRadialGradient(0, -halfH * 0.25, 2, 0, 0, block.width * 0.72);
        bodyGrad.addColorStop(0, toAlphaColor(strokeColor, isPowerup ? 0.34 : 0.28));
        bodyGrad.addColorStop(1, 'rgba(11, 18, 34, 0.88)');
        ctx.fillStyle = bodyGrad;
      }
      ctx.fill();

      ctx.lineWidth = block.armored || isPowerup ? 2.5 : 2.1;
      ctx.strokeStyle = isFlashing ? '#ffffff' : strokeColor;
      ctx.stroke();

      // Hot specular inner neon filament for crisp edge contrast
      if (!isFlashing) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(-halfW + 1.8, -halfH + 1.8, block.width - 3.6, block.height - 3.6, 6.5);
        ctx.lineWidth = 0.95;
        ctx.strokeStyle = isPowerup
          ? 'rgba(255, 255, 255, 0.56)'
          : 'rgba(255, 255, 255, 0.34)';
        ctx.stroke();
      }

      if (isPowerup) {
        const pulse = prefersReducedMotion
          ? 0.72
          : 0.65 + 0.35 * Math.sin(state.multiplierHudPhase * 4.5);
        ctx.shadowColor = 'rgba(253, 224, 71, 0.8)';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(253, 224, 71, ${pulse.toFixed(2)})`;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.roundRect(-halfW + 4, -halfH + 4, block.width - 8, block.height - 8, 5);
        ctx.stroke();

        // Corner power-up emblem (top-right)
        ctx.save();
        ctx.translate(halfW - 9, -halfH + 9);
        ctx.shadowBlur = 6;
        if (isShieldBuff) {
          ctx.fillStyle = '#e0e7ff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          drawShieldIcon(ctx, 4.6);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = '#fef08a';
          ctx.font = '800 8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('×3', 0, 0.5);
        }
        ctx.restore();
      } else if (block.armored) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(-halfW + 4.5, -halfH + 4.5, block.width - 9, block.height - 9, 4.5);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.stroke();
      }
    } else {
      const r = block.width * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);

      if (isFlashing) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
      } else {
        const bodyGrad = ctx.createRadialGradient(0, -r * 0.25, 2, 0, 0, r);
        bodyGrad.addColorStop(0, toAlphaColor(strokeColor, 0.3));
        bodyGrad.addColorStop(1, 'rgba(11, 18, 34, 0.88)');
        ctx.fillStyle = bodyGrad;
      }
      ctx.fill();

      ctx.lineWidth = block.armored ? 2.5 : 2.1;
      ctx.strokeStyle = isFlashing ? '#ffffff' : strokeColor;
      ctx.stroke();

      if (!isFlashing) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, r - 1.8, 0, Math.PI * 2);
        ctx.lineWidth = 0.95;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.stroke();
      }

      if (block.armored) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, r - 4.5, 0, Math.PI * 2);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
        ctx.stroke();
      }
    }

    // Crisp high-contrast hit counter with dark halo & soft neon glow
    const fontSize = block.hp >= 100 ? 13 : block.hp >= 10 ? 15 : 17;
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = isPowerup ? 3 : 1;

    if (!isFlashing) {
      ctx.shadowBlur = 0;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(7, 11, 20, 0.86)';
      ctx.strokeText(String(block.hp), 0, labelY);
    }

    ctx.shadowColor = isFlashing ? 'transparent' : toAlphaColor(strokeColor, 0.7);
    ctx.shadowBlur = isFlashing ? 0 : 6;
    ctx.fillStyle = isFlashing ? '#0f172a' : '#ffffff';
    ctx.fillText(String(block.hp), 0, labelY);
    ctx.restore();
  }

  // Pickups (+1 Ball, Multi-ball x3, Shield, Bomb) with luminous neon bloom & crisp cores
  for (const pickup of state.pickups) {
    const pulse = 1 + Math.sin(pickup.pulsePhase) * 0.12;
    ctx.save();
    ctx.translate(pickup.x, pickup.y);

    if (pickup.type === 'extra_ball') {
      const r = pickup.radius * pulse;
      ctx.strokeStyle = '#34d399';
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.shadowColor = 'rgba(52, 211, 153, 0.92)';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner bright core
      ctx.shadowColor = '#a7f3d0';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#6ee7b7';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.font = '800 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(7, 11, 20, 0.9)';
      ctx.strokeText('+1', 0, -pickup.radius - 6);
      ctx.fillStyle = '#d1fae5';
      ctx.fillText('+1', 0, -pickup.radius - 6);
    } else if (pickup.type === 'multi_ball') {
      const r = pickup.radius * pulse;
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(14, 165, 233, 0.3)';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.95)';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '800 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(7, 11, 20, 0.9)';
      ctx.strokeText('×3', 0, 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('×3', 0, 0.5);
    } else if (pickup.type === 'shield') {
      // Aegis Shield pickup
      const r = pickup.radius * pulse;
      ctx.strokeStyle = '#60a5fa';
      ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.shadowColor = 'rgba(96, 165, 250, 0.95)';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2.2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowColor = '#93c5fd';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#bae6fd';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      drawShieldIcon(ctx, 7.2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Bomb pickup
      const r = pickup.radius * pulse;
      ctx.strokeStyle = '#fb923c';
      ctx.fillStyle = 'rgba(249, 115, 22, 0.32)';
      ctx.shadowColor = 'rgba(251, 146, 60, 0.95)';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 2.2;
      drawPolygon(ctx, 0, 0, r, 6, pickup.pulsePhase * 0.25);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 237, 213, 0.55)';
      ctx.lineWidth = 1;
      drawPolygon(ctx, 0, 0, r - 2.4, 6, pickup.pulsePhase * 0.25);
      ctx.stroke();

      ctx.shadowColor = '#fdba74';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fff7ed';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✸', 0, 0.5);
    }
    ctx.restore();
  }

  // Floating buff icons spawned when rare Power-up bricks break
  for (const buff of state.floatingBuffs) {
    if (buff.collected) continue;
    const bobOffset = prefersReducedMotion ? 0 : Math.sin(buff.bobPhase) * 3.2;
    const blinkAlpha =
      buff.life < 2.2
        ? 0.4 + 0.6 * Math.abs(Math.sin(buff.bobPhase * 3.2))
        : 1;
    const isMulti = buff.type === 'multi_ball';
    const accent = isMulti ? '#38bdf8' : '#818cf8';

    ctx.save();
    ctx.translate(buff.x, buff.y + bobOffset);
    ctx.globalAlpha = blinkAlpha;

    // Rotating prism outer neon halo
    ctx.strokeStyle = '#fde047';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 1.9;
    drawPolygon(
      ctx,
      0,
      0,
      buff.radius + 3.2,
      6,
      prefersReducedMotion ? 0 : buff.bobPhase * 0.45
    );
    ctx.stroke();

    // Inner glowing core medallion with high-contrast gradient
    const coreGrad = ctx.createRadialGradient(0, -2, 1, 0, 0, buff.radius);
    coreGrad.addColorStop(0, toAlphaColor(accent, 0.55));
    coreGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
    ctx.fillStyle = coreGrad;
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(0, 0, buff.radius - 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crisp specular inner rim
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, buff.radius - 2.6, 0, Math.PI * 2);
    ctx.stroke();

    if (isMulti) {
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×3', 0, 0.5);
    } else {
      ctx.shadowColor = '#a5b4fc';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#e0e7ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      drawShieldIcon(ctx, 7.6);
      ctx.fill();
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.font = '800 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';
    const label = isMulti ? 'MULTI' : 'SHIELD+';
    ctx.strokeText(label, 0, buff.radius + 5);
    ctx.shadowColor = 'rgba(253, 224, 71, 0.75)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fef08a';
    ctx.fillText(label, 0, buff.radius + 5);

    ctx.restore();
  }

  // Physics-based debris shards & directional glowing sparks
  for (const p of state.particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;

    if (p.kind === 'shard') {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      drawPolygon(ctx, p.x, p.y, p.radius, p.sides, p.rotation, p.stretch);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      const spd = Math.hypot(p.vx, p.vy);
      const streak = Math.min(12, Math.max(p.radius * 1.4, spd * 0.032));
      const ux = spd > 1 ? p.vx / spd : 0;
      const uy = spd > 1 ? p.vy / spd : -1;
      ctx.strokeStyle = p.color;
      ctx.lineCap = 'round';
      ctx.lineWidth = p.radius * 1.1;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(p.x - ux * streak, p.y - uy * streak);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Renderer-driven colorful fading spark explosions on brick destruction
  updateAndRenderBrickExplosions(ctx, state, Boolean(prefersReducedMotion));

  // Dotted trajectory preview (initial path + 1st bounce)
  if (state.phase === 'AIMING' && state.aim.isValid && state.aim.previewPoints.length >= 2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.82)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 9]);
    ctx.beginPath();
    const pts = state.aim.previewPoints;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    if (pts.length >= 3) {
      ctx.setLineDash([]);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(pts[1].x, pts[1].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Balls & velocity-scaled tapered motion trails (with escalating chain aura on hot trajectories)
  for (const ball of state.balls) {
    if (!ball.active) continue;

    const hasChain = ball.destroyChain >= 2;
    const chainColor = hasChain ? getChainMultiplierColor(ball.destroyChain) : null;

    const speedScale = state.fastForward && !ball.recalling ? 2 : 1;
    const effVx = ball.vx * speedScale;
    const effVy = ball.vy * speedScale;
    const speed = Math.hypot(effVx, effVy);
    const speedNorm = Math.min(2.8, Math.max(0.45, speed / BALL_SPEED));

    // Dynamically extend visible trail length based on current velocity
    const trailLen = ball.trail.length;
    if (trailLen >= 1) {
      const visibleCount = Math.min(trailLen, Math.round(5 + speedNorm * 8));
      const startIdx = trailLen - visibleCount;
      const totalSegs = visibleCount; // segments from startIdx -> ... -> ball head
      const bandCount = Math.min(5, totalSegs);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = chainColor ?? '#bae6fd';

      for (let b = 0; b < bandCount; b++) {
        const segStart = Math.floor((b * totalSegs) / bandCount);
        const segEnd = Math.floor(((b + 1) * totalSegs) / bandCount);
        if (segEnd <= segStart) continue;

        const t = (b + 1) / bandCount;
        const speedAlphaBoost = Math.min(0.16, Math.max(0, speedNorm - 1) * 0.1);
        ctx.globalAlpha = 0.06 + t * t * (0.44 + speedAlphaBoost);
        ctx.lineWidth = ball.radius * (0.28 + t * (1.28 + Math.min(0.32, speedNorm * 0.12)));

        ctx.beginPath();
        const firstPt = ball.trail[startIdx + segStart];
        ctx.moveTo(firstPt.x, firstPt.y);
        for (let s = segStart + 1; s <= segEnd; s++) {
          const idx = startIdx + s;
          const pt = idx < trailLen ? ball.trail[idx] : { x: ball.x, y: ball.y };
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      // High-velocity inner wake streak directly behind the ball
      if (speed > 20) {
        const ux = effVx / speed;
        const uy = effVy / speed;
        const streakLen = ball.radius * (1.4 + speedNorm * 2.1);
        ctx.globalAlpha = 0.35 + Math.min(0.25, speedNorm * 0.1);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = ball.radius * 0.85;
        ctx.beginPath();
        ctx.moveTo(ball.x - ux * streakLen, ball.y - uy * streakLen);
        ctx.lineTo(ball.x, ball.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (chainColor) {
      ctx.save();
      ctx.strokeStyle = chainColor;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 3.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = chainColor ?? 'rgba(255, 255, 255, 0.85)';
    ctx.shadowBlur = chainColor ? 14 : 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Floating score multiplier popups when multiple bricks break in one trajectory
  for (const pop of state.multiplierPopups) {
    const progress = 1 - pop.life / pop.maxLife;
    // Elastic overshoot on spawn, settling to 1.0
    let scale = 1;
    if (progress < 0.16) {
      const p = progress / 0.16;
      scale = 0.55 + 0.75 * Math.sin((p * Math.PI) / 2);
    } else if (progress < 0.32) {
      const p = (progress - 0.16) / 0.16;
      scale = 1.3 - 0.3 * p;
    }

    const alpha = pop.life < pop.maxLife * 0.35 ? pop.life / (pop.maxLife * 0.35) : 1;

    ctx.save();
    ctx.translate(pop.x, pop.y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // Brief radiant halo ring on spawn
    if (progress < 0.32) {
      const ringProgress = progress / 0.32;
      ctx.save();
      ctx.globalAlpha *= (1 - ringProgress) * 0.75;
      ctx.strokeStyle = pop.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 12 + ringProgress * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Multiplier badge text (e.g. ×2, ×3, ×4...)
    const label = `×${pop.multiplier}`;
    const fontSize = pop.multiplier >= 6 ? 21 : pop.multiplier >= 4 ? 19 : 17;
    ctx.font = `800 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';
    ctx.strokeText(label, 0, 0);

    ctx.shadowColor = pop.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = pop.color;
    ctx.fillText(label, 0, 0);

    // Score bonus readout directly underneath
    const bonusText = `+${pop.bonusPoints}`;
    ctx.shadowBlur = 0;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(7, 11, 20, 0.9)';
    ctx.strokeText(bonusText, 0, 14);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(bonusText, 0, 14);

    ctx.restore();
  }

  // Next launch anchor marker when balls are in flight
  if (state.nextLaunchX !== null) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(state.nextLaunchX, FLOOR_Y - BALL_RADIUS, BALL_RADIUS + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Launcher turret & ball count indicator
  ctx.save();
  ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(state.launchX, FLOOR_Y - BALL_RADIUS, BALL_RADIUS + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const remaining =
    state.phase === 'FIRING' ? state.ballsToFire : state.phase === 'AIMING' ? state.ballCount : 0;
  if (remaining > 0) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`×${remaining}`, state.launchX, FLOOR_Y + 16);
  }

  // Initial aim guidance cue before first shot
  if (state.phase === 'AIMING' && !state.hasTakenFirstShot && !state.aim.isDragging) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drag down to aim · Release to fire', LOGICAL_WIDTH / 2, FLOOR_Y - 56);
  }

  // Stage escalation announcement (shifts cleanly below active COMBO / multiplier HUD if overlapping)
  if (state.tierBannerTimer > 0 && state.tierBannerText) {
    const alpha = Math.min(1, state.tierBannerTimer / 0.5);
    const bannerY =
      state.trajectoryCombo >= 2 || state.multiplierHudAlpha > 0.05 ? 56 : 22;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 10.5px "JetBrains Mono", monospace';
    const textW = ctx.measureText(state.tierBannerText).width;
    const boxW = Math.min(LOGICAL_WIDTH - 24, textW + 24);
    const boxH = 22;

    ctx.fillStyle = 'rgba(7, 11, 20, 0.88)';
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.roundRect(LOGICAL_WIDTH / 2 - boxW / 2, bannerY - boxH / 2, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.tierBannerText, LOGICAL_WIDTH / 2, bannerY + 0.5);
    ctx.restore();
  }

  // Aegis Shield / Buff activation announcement above the danger line
  if (state.shieldNoticeTimer > 0 && state.shieldNoticeText) {
    const alpha = Math.min(1, state.shieldNoticeTimer / 0.45);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';
    ctx.strokeText(state.shieldNoticeText, LOGICAL_WIDTH / 2, DANGER_Y - 26);
    ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#bae6fd';
    ctx.fillText(state.shieldNoticeText, LOGICAL_WIDTH / 2, DANGER_Y - 26);
    ctx.restore();
  }

  // Active temporary buff timers in the open lane just above FLOOR_Y
  if (state.buffMultiBallTurns > 0 || state.buffShieldExpandTurns > 0) {
    ctx.save();
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    if (state.buffMultiBallTurns > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText(
        `MULTI-BALL +3 · ${state.buffMultiBallTurns}T`,
        14,
        FLOOR_Y - 14
      );
    }
    if (state.buffShieldExpandTurns > 0) {
      ctx.fillStyle = '#a5b4fc';
      ctx.textAlign = 'right';
      ctx.fillText(
        `SHIELD+ WIDE · ${state.buffShieldExpandTurns}T`,
        LOGICAL_WIDTH - 14,
        FLOOR_Y - 14
      );
    }
    ctx.restore();
  }

  // Floating, animated top-right Destroy Chain Multiplier HUD (glows yellow -> orange as chain grows, fades on reset)
  if (state.multiplierHudAlpha > 0.01 && state.turnPeakMultiplier >= 2) {
    const mult = state.turnPeakMultiplier;
    const heat = Math.min(1, (mult - 2) / 6); // 0 at ×2 (solar yellow) -> 1 at ×8+ (blazing orange)
    const hue = 50 - heat * 28; // 50° yellow -> 22° deep orange
    const lightness = 64 - heat * 7;
    const coreColor = `hsl(${hue.toFixed(0)}, 98%, ${lightness.toFixed(0)}%)`;
    const borderColor = `hsla(${(hue - 3).toFixed(0)}, 100%, 62%, 0.92)`;
    const glowColor = `hsla(${(hue - 5).toFixed(0)}, 100%, 54%, ${(0.55 + heat * 0.35).toFixed(2)})`;

    const floatY = prefersReducedMotion
      ? 0
      : Math.sin(state.multiplierHudPhase * 3.6) * 2.4;
    const baseScale = 1 + Math.min(mult - 2, 10) * 0.032;
    const bumpScale = prefersReducedMotion
      ? 0
      : Math.sin(state.multiplierHudBump * Math.PI) * 0.2;
    const resetShrink = state.multiplierHudResetting
      ? 0.88 + 0.12 * state.multiplierHudAlpha
      : 1;
    const totalScale = (baseScale + bumpScale) * resetShrink;

    ctx.save();
    ctx.translate(LOGICAL_WIDTH - 52, 22 + floatY);
    ctx.scale(totalScale, totalScale);
    ctx.globalAlpha = state.multiplierHudAlpha;

    // Ambient radial yellow-to-orange glow aura
    const auraRadius = 40 + heat * 12 + state.multiplierHudBump * 10;
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, auraRadius);
    aura.addColorStop(
      0,
      `hsla(${(hue - 2).toFixed(0)}, 100%, 58%, ${(0.32 + heat * 0.18).toFixed(2)})`
    );
    aura.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    // Compact glowing HUD capsule frame
    const hudW = mult >= 10 ? 84 : 76;
    const hudH = 24;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12 + heat * 12 + state.multiplierHudBump * 8;
    ctx.fillStyle = 'rgba(7, 11, 20, 0.84)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-hudW / 2, -hudH / 2, hudW, hudH, 8);
    ctx.fill();
    ctx.stroke();

    // Crisp label + scaling multiplier value
    ctx.shadowBlur = 8 + heat * 8;
    ctx.textBaseline = 'middle';

    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'right';
    ctx.fillText('CHAIN', -3, 0.5);

    ctx.font = '800 14px "JetBrains Mono", monospace';
    ctx.fillStyle = coreColor;
    ctx.textAlign = 'left';
    ctx.fillText(`×${mult}`, 3, 0.5);

    ctx.restore();
  }

  ctx.restore();
}
