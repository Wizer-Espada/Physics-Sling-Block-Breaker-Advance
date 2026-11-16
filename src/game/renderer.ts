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

  // Subtle tactical grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
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

    // Subtle glowing energy corridor along the danger line
    const grad = ctx.createLinearGradient(0, DANGER_Y - 7, 0, DANGER_Y + 7);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    grad.addColorStop(
      0.5,
      state.shields >= 2
        ? `rgba(129, 140, 248, ${(0.22 + pulse * 0.08).toFixed(2)})`
        : `rgba(56, 189, 248, ${(0.18 + pulse * 0.08).toFixed(2)})`
    );
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(barLeft, DANGER_Y - 7, barRight - barLeft, 14);

    // Primary luminous Aegis barrier beam
    ctx.shadowColor = state.shields >= 2 ? 'rgba(129, 140, 248, 0.85)' : 'rgba(56, 189, 248, 0.8)';
    ctx.shadowBlur = 10 + pulse * 4;
    ctx.strokeStyle = nearDanger
      ? '#60a5fa'
      : state.shields >= 2
        ? '#818cf8'
        : '#38bdf8';
    ctx.lineWidth = state.shields >= 2 ? 2.4 : 1.8;
    ctx.beginPath();
    ctx.moveTo(barLeft, DANGER_Y);
    ctx.lineTo(barRight, DANGER_Y);
    ctx.stroke();

    // Secondary rail when stacked to 2 shields
    if (state.shields >= 2) {
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
    ctx.fillStyle = '#bae6fd';
    for (const ax of [barLeft, barRight]) {
      drawPolygon(ctx, ax, DANGER_Y, 4, 4, Math.PI / 4);
      ctx.fill();
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

  // Blocks
  for (const block of state.blocks) {
    const palette = getBlockColors(block.hp);
    const isDanger = block.row === DANGER_ROW - 1;
    const strokeColor = isDanger ? '#fb7185' : palette.stroke;
    const fillColor = isDanger ? 'rgba(244, 63, 94, 0.25)' : palette.fill;
    const scaleBoost = 1 + block.hitScale * 0.08;

    const cx = block.x + block.width / 2;
    const cy = block.y + block.height / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scaleBoost, scaleBoost);

    ctx.shadowColor = isDanger ? 'rgba(244, 63, 94, 0.55)' : palette.glow;
    ctx.shadowBlur = block.flashTimer > 0 ? 16 : 8;

    if (block.shape === 'rect') {
      const halfW = block.width / 2;
      const halfH = block.height / 2;
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, block.width, block.height, 8);
      ctx.fillStyle = block.flashTimer > 0 ? 'rgba(255, 255, 255, 0.72)' : fillColor;
      ctx.fill();
      ctx.lineWidth = block.armored ? 2.5 : 2;
      ctx.strokeStyle = block.flashTimer > 0 ? '#ffffff' : strokeColor;
      ctx.stroke();

      if (block.armored) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(-halfW + 4, -halfH + 4, block.width - 8, block.height - 8, 5);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
      }
    } else {
      const r = block.width * 0.45;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = block.flashTimer > 0 ? 'rgba(255, 255, 255, 0.72)' : fillColor;
      ctx.fill();
      ctx.lineWidth = block.armored ? 2.5 : 2;
      ctx.strokeStyle = block.flashTimer > 0 ? '#ffffff' : strokeColor;
      ctx.stroke();

      if (block.armored) {
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, r - 4, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
      }
    }

    // Crisp bold centered hit counter
    ctx.shadowBlur = 0;
    ctx.fillStyle = block.flashTimer > 0 ? '#0f172a' : palette.text;
    const fontSize = block.hp >= 100 ? 13 : block.hp >= 10 ? 15 : 17;
    ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(block.hp), 0, 1);
    ctx.restore();
  }

  // Pickups (+1 Ball, Multi-ball x3, Bomb)
  for (const pickup of state.pickups) {
    const pulse = 1 + Math.sin(pickup.pulsePhase) * 0.12;
    ctx.save();
    ctx.translate(pickup.x, pickup.y);

    if (pickup.type === 'extra_ball') {
      ctx.strokeStyle = '#34d399';
      ctx.shadowColor = 'rgba(52, 211, 153, 0.65)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pickup.radius * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#a7f3d0';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+1', 0, -pickup.radius - 6);
    } else if (pickup.type === 'multi_ball') {
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.7)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pickup.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#e0f2fe';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×3', 0, 0.5);
    } else if (pickup.type === 'shield') {
      // Aegis Shield pickup
      ctx.strokeStyle = '#60a5fa';
      ctx.fillStyle = 'rgba(96, 165, 250, 0.18)';
      ctx.shadowColor = 'rgba(96, 165, 250, 0.8)';
      ctx.shadowBlur = 13;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, pickup.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#93c5fd';
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.5;
      drawShieldIcon(ctx, 7.2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Bomb pickup
      ctx.strokeStyle = '#fb923c';
      ctx.fillStyle = 'rgba(251, 146, 60, 0.2)';
      ctx.shadowColor = 'rgba(251, 146, 60, 0.75)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      drawPolygon(ctx, 0, 0, pickup.radius * pulse, 6, pickup.pulsePhase * 0.25);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffedd5';
      ctx.font = '700 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✸', 0, 0.5);
    }
    ctx.restore();
  }

  // Physics-based debris shards & glowing sparks
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
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

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

  // Tier escalation announcement (shifts cleanly below active multiplier HUD if overlapping)
  if (state.tierBannerTimer > 0 && state.tierBannerText) {
    const alpha = Math.min(1, state.tierBannerTimer / 0.5);
    const bannerY = state.multiplierHudAlpha > 0.05 ? 42 : 24;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state.tierBannerText, LOGICAL_WIDTH / 2, bannerY);
    ctx.restore();
  }

  // Aegis Shield activation / recharge announcement above the danger line
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
    ctx.strokeText(state.shieldNoticeText, LOGICAL_WIDTH / 2, DANGER_Y - 16);
    ctx.shadowColor = 'rgba(56, 189, 248, 0.85)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#bae6fd';
    ctx.fillText(state.shieldNoticeText, LOGICAL_WIDTH / 2, DANGER_Y - 16);
    ctx.restore();
  }

  // Floating, animated top-center Score Multiplier HUD (glows yellow -> orange as chain grows, fades on reset)
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
    const baseScale = 1 + Math.min(mult - 2, 10) * 0.042;
    const bumpScale = prefersReducedMotion
      ? 0
      : Math.sin(state.multiplierHudBump * Math.PI) * 0.24;
    const resetShrink = state.multiplierHudResetting
      ? 0.88 + 0.12 * state.multiplierHudAlpha
      : 1;
    const totalScale = (baseScale + bumpScale) * resetShrink;

    ctx.save();
    ctx.translate(LOGICAL_WIDTH / 2, 22 + floatY);
    ctx.scale(totalScale, totalScale);
    ctx.globalAlpha = state.multiplierHudAlpha;

    // Ambient radial yellow-to-orange glow aura
    const auraRadius = 46 + heat * 14 + state.multiplierHudBump * 12;
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
    const hudW = mult >= 10 ? 96 : 88;
    const hudH = 26;
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
