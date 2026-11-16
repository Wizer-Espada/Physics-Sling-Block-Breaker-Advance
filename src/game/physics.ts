import { soundEngine } from './audio.ts';
import { getBlockColors, getChainMultiplierColor } from './colors.ts';
import { hapticsEngine } from './haptics.ts';
import {
  BALL_RADIUS,
  BALL_SPEED,
  BEST_SCORE_KEY,
  Ball,
  Block,
  BlockShape,
  CELL_GAP,
  CELL_SIZE,
  COLS,
  DANGER_ROW,
  DANGER_Y,
  FIRE_INTERVAL,
  FLOOR_Y,
  GameState,
  LOGICAL_WIDTH,
  MAX_ANGLE_RAD,
  MAX_SHIELDS,
  MIN_ANGLE_RAD,
  PADDING_X,
  Pickup,
  PickupType,
  RECALL_DURATION,
  ROW_STEP,
  SHIFT_DURATION,
  TOP_OFFSET,
} from './types.ts';

const MAX_ACTIVE_BALLS = 90;
const MAX_PARTICLES = 360;
const MAX_MULTIPLIER_POPUPS = 28;
const MAX_CHAIN_MULTIPLIER = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function colToX(col: number): number {
  return PADDING_X + col * ROW_STEP;
}

export function rowToY(row: number): number {
  return TOP_OFFSET + row * ROW_STEP;
}

export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Ignore storage errors
  }
}

function shuffleCols(): number[] {
  const arr = Array.from({ length: COLS }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getDifficultyTier(turn: number): number {
  return 1 + Math.floor(turn / 10);
}

interface TierProfile {
  tier: number;
  baseHpMult: number;
  circleChance: number;
  doubleChance: number;
  tripleChance: number;
  minBlocks: number;
  maxBlocks: number;
  specialChance: number;
}

function getTierProfile(turn: number): TierProfile {
  const tier = getDifficultyTier(turn);
  if (tier === 1) {
    return {
      tier,
      baseHpMult: 1.0,
      circleChance: turn >= 2 ? 0.24 : 0,
      doubleChance: turn >= 4 ? 0.16 : 0,
      tripleChance: 0,
      minBlocks: turn <= 2 ? 2 : 3,
      maxBlocks: turn <= 4 ? 4 : 5,
      specialChance: turn === 1 ? 0.55 : 0.6,
    };
  }
  if (tier === 2) {
    return {
      tier,
      baseHpMult: 1.25,
      circleChance: 0.35,
      doubleChance: 0.3,
      tripleChance: 0.1,
      minBlocks: 4,
      maxBlocks: 5,
      specialChance: 0.64,
    };
  }
  if (tier === 3) {
    return {
      tier,
      baseHpMult: 1.55,
      circleChance: 0.44,
      doubleChance: 0.38,
      tripleChance: 0.22,
      minBlocks: 4,
      maxBlocks: 6,
      specialChance: 0.68,
    };
  }
  return {
    tier,
    baseHpMult: 1.55 + (tier - 3) * 0.35,
    circleChance: Math.min(0.55, 0.44 + (tier - 3) * 0.04),
    doubleChance: 0.42,
    tripleChance: Math.min(0.36, 0.22 + (tier - 3) * 0.05),
    minBlocks: 5,
    maxBlocks: 6,
    specialChance: 0.72,
  };
}

function pickTieredLayout(
  tier: number,
  turn: number,
  hasSpecial: boolean
): { pickupCols: number[]; blockCols: number[] } {
  const shuffled = shuffleCols();
  const maxAvailableBlocks = hasSpecial ? COLS - 2 : COLS - 1;

  // Tier 1 uses organic staggered scatter
  if (tier === 1) {
    const pickupCols = hasSpecial ? [shuffled[0], shuffled[1]] : [shuffled[0]];
    return {
      pickupCols,
      blockCols: shuffled.slice(pickupCols.length),
    };
  }

  // Milestone turns (10, 20, 30...) deploy a fortified Siege Wall
  if (turn % 10 === 0) {
    const gapCol = 1 + Math.floor(Math.random() * (COLS - 2)); // leave an off-center lane for +1 ball
    const specialCol = gapCol <= 3 ? 5 : 1;
    const pickupCols = hasSpecial ? [gapCol, specialCol] : [gapCol];
    const blockCols = Array.from({ length: COLS }, (_, c) => c).filter(
      (c) => !pickupCols.includes(c)
    );
    return { pickupCols, blockCols: blockCols.slice(0, maxAvailableBlocks) };
  }

  // Tier 2+: Rotate through structured tactical obstacle formations
  const patternRoll = Math.random();
  if (patternRoll < 0.34) {
    // Fortress Wings: armored outer flanks, pickups tucked down the center
    const centerCandidates = [2, 3, 4].sort(() => Math.random() - 0.5);
    const pickupCols = hasSpecial ? centerCandidates.slice(0, 2) : [centerCandidates[0]];
    const wingCols = [0, 1, 5, 6, 2, 3, 4].filter((c) => !pickupCols.includes(c));
    return { pickupCols, blockCols: wingCols.slice(0, maxAvailableBlocks) };
  }
  if (patternRoll < 0.68) {
    // Choke Gate: dense middle wall forcing side-wall bank angles
    const edgeCandidates = [0, 6, 1, 5].sort(() => Math.random() - 0.5);
    const pickupCols = hasSpecial ? edgeCandidates.slice(0, 2) : [edgeCandidates[0]];
    const gateCols = [2, 3, 4, 1, 5, 0, 6].filter((c) => !pickupCols.includes(c));
    return { pickupCols, blockCols: gateCols.slice(0, maxAvailableBlocks) };
  }

  // Checkerboard / Staggered Bastion
  const oddCols = [1, 3, 5].sort(() => Math.random() - 0.5);
  const pickupCols = hasSpecial ? oddCols.slice(0, 2) : [oddCols[0]];
  const blockCols = [0, 2, 4, 6, 1, 3, 5].filter((c) => !pickupCols.includes(c));
  return { pickupCols, blockCols: blockCols.slice(0, maxAvailableBlocks) };
}

export function createInitialGameState(dailyScoreMultiplier = 1): GameState {
  const bestScore = loadBestScore();
  const state: GameState = {
    phase: 'AIMING',
    score: 0,
    bestScore,
    turn: 1,
    ballCount: 1,
    pendingExtraBalls: 0,
    powerupsCollected: 0,
    maxBalls: 1,
    launchX: LOGICAL_WIDTH / 2,
    nextLaunchX: null,
    launchAngleRad: Math.PI / 2,
    ballsToFire: 0,
    fireCooldown: 0,
    fastForward: false,
    recallActive: false,
    shiftTimer: 0,
    shakeTrauma: 0,
    shakeKickX: 0,
    shakeKickY: 0,
    combo: 0,
    turnPeakMultiplier: 0,
    turnPeakMultiplierTimer: 0,
    multiplierHudAlpha: 0,
    multiplierHudBump: 0,
    multiplierHudPhase: 0,
    multiplierHudResetting: false,
    peakChainThisRun: 0,
    blocksDestroyed: 0,
    bombsDetonated: 0,
    dailyScoreMultiplier: Math.max(1, dailyScoreMultiplier),
    scoreRemainder: 0,
    isNewBest: false,
    hasTakenFirstShot: false,
    difficultyTier: 1,
    tierBannerText: null,
    tierBannerTimer: 0,
    shields: 1,
    shieldFlashTimer: 0,
    shieldNoticeText: null,
    shieldNoticeTimer: 0,
    nextEntityId: 1,
    blocks: [],
    pickups: [],
    balls: [],
    particles: [],
    shockwaves: [],
    multiplierPopups: [],
    aim: {
      isDragging: false,
      isValid: false,
      angleRad: Math.PI / 2,
      pullDistance: 0,
      previewPoints: [],
    },
  };

  spawnRow(state, false);
  return state;
}

export function spawnRow(state: GameState, animateEntry: boolean): void {
  const profile = getTierProfile(state.turn);
  const y = animateEntry ? rowToY(-1) : rowToY(0);
  const spawnSpecial = Math.random() < profile.specialChance;
  const { pickupCols, blockCols } = pickTieredLayout(
    profile.tier,
    state.turn,
    spawnSpecial
  );

  // Guaranteed "+1 Ball" token each turn
  const ballPickupCol = pickupCols[0];
  state.pickups.push({
    id: state.nextEntityId++,
    type: 'extra_ball',
    col: ballPickupCol,
    row: 0,
    x: colToX(ballPickupCol) + CELL_SIZE / 2,
    y: y + CELL_SIZE / 2,
    radius: 11,
    collected: false,
    pulsePhase: Math.random() * Math.PI * 2,
  });

  // Dynamic Multi-ball, Bomb, or Aegis Shield power-up alongside +1 token
  if (spawnSpecial && pickupCols.length > 1) {
    const specialCol = pickupCols[1];
    const nearDanger = state.blocks.some((b) => b.row >= DANGER_ROW - 3);
    const shieldChance =
      state.shields === 0
        ? nearDanger
          ? 0.44
          : 0.34
        : state.shields < MAX_SHIELDS
          ? 0.24
          : 0.12;
    const roll = Math.random();
    const pType: PickupType =
      state.turn >= 2 && roll < shieldChance
        ? 'shield'
        : Math.random() < 0.52
          ? 'multi_ball'
          : 'bomb';
    state.pickups.push({
      id: state.nextEntityId++,
      type: pType,
      col: specialCol,
      row: 0,
      x: colToX(specialCol) + CELL_SIZE / 2,
      y: y + CELL_SIZE / 2,
      radius: 13,
      collected: false,
      pulsePhase: Math.random() * Math.PI * 2,
    });
  }

  const maxCount = Math.min(blockCols.length, profile.maxBlocks);
  const minCount = Math.min(maxCount, profile.minBlocks);
  const isMilestone = state.turn % 10 === 0;
  const count = isMilestone
    ? maxCount
    : minCount + Math.floor(Math.random() * Math.max(1, maxCount - minCount + 1));

  const baseHp = Math.max(1, Math.round(state.turn * profile.baseHpMult));

  for (let i = 0; i < count && i < blockCols.length; i++) {
    const col = blockCols[i];
    const roll = Math.random();

    let hpMult = 1;
    if (isMilestone && i === 0) {
      hpMult = Math.min(4, 2 + Math.floor(profile.tier / 2)); // Keystone boss brick on every 10th turn
    } else if (state.turn % 5 === 0 && i === 0) {
      hpMult = 2;
    } else if (roll < profile.tripleChance) {
      hpMult = 3;
    } else if (roll < profile.tripleChance + profile.doubleChance) {
      hpMult = 2;
    }

    const hp = Math.max(1, Math.round(baseHp * hpMult));
    const armored = hpMult >= 2;
    const shape: BlockShape =
      Math.random() < profile.circleChance ? 'circle' : 'rect';

    const block: Block = {
      id: state.nextEntityId++,
      col,
      row: 0,
      x: colToX(col),
      y,
      width: CELL_SIZE,
      height: CELL_SIZE,
      hp,
      maxHp: hp,
      shape,
      armored,
      flashTimer: 0,
      hitScale: 0,
    };
    state.blocks.push(block);
  }
}

export function computeAimPreview(
  state: GameState,
  angleRad: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let x = state.launchX;
  let y = FLOOR_Y - BALL_RADIUS;
  let dx = Math.cos(angleRad);
  let dy = -Math.sin(angleRad);

  points.push({ x, y });

  const step = 3.5;
  const maxSteps = 280;
  let bounced = false;
  let postBounceLength = 0;

  for (let i = 0; i < maxSteps; i++) {
    x += dx * step;
    y += dy * step;

    if (bounced) {
      postBounceLength += step;
      if (postBounceLength > 140) {
        points.push({ x, y });
        break;
      }
    }

    if (y > FLOOR_Y) break;

    let hitWall = false;
    let nx = 0;
    let ny = 0;

    if (x - BALL_RADIUS <= 0) {
      x = BALL_RADIUS;
      nx = 1;
      hitWall = true;
    } else if (x + BALL_RADIUS >= LOGICAL_WIDTH) {
      x = LOGICAL_WIDTH - BALL_RADIUS;
      nx = -1;
      hitWall = true;
    } else if (y - BALL_RADIUS <= 0) {
      y = BALL_RADIUS;
      ny = 1;
      hitWall = true;
    }

    let hitBlock = false;
    if (!hitWall) {
      for (const block of state.blocks) {
        if (block.hp <= 0) continue;
        if (block.shape === 'rect') {
          const cx = clamp(x, block.x, block.x + block.width);
          const cy = clamp(y, block.y, block.y + block.height);
          const ox = x - cx;
          const oy = y - cy;
          const d2 = ox * ox + oy * oy;
          if (d2 < BALL_RADIUS * BALL_RADIUS) {
            const d = Math.sqrt(d2) || 0.001;
            nx = ox / d;
            ny = oy / d;
            x = cx + nx * BALL_RADIUS;
            y = cy + ny * BALL_RADIUS;
            hitBlock = true;
            break;
          }
        } else {
          const bx = block.x + block.width / 2;
          const by = block.y + block.height / 2;
          const br = block.width * 0.45;
          const ox = x - bx;
          const oy = y - by;
          const minDist = BALL_RADIUS + br;
          const d2 = ox * ox + oy * oy;
          if (d2 < minDist * minDist) {
            const d = Math.sqrt(d2) || 0.001;
            nx = ox / d;
            ny = oy / d;
            x = bx + nx * minDist;
            y = by + ny * minDist;
            hitBlock = true;
            break;
          }
        }
      }
    }

    if (hitWall || hitBlock) {
      points.push({ x, y });
      if (!bounced) {
        const dot = dx * nx + dy * ny;
        if (dot < 0) {
          dx -= 2 * dot * nx;
          dy -= 2 * dot * ny;
        }
        bounced = true;
      } else {
        break;
      }
    }
  }

  if (points.length === 1) {
    points.push({ x, y });
  }
  return points;
}

export function updateAim(state: GameState, rawDx: number, rawDy: number): void {
  if (state.phase !== 'AIMING') return;

  // Player pulls downward (rawDy < 0 when startY - currentY < 0, meaning dragging down aims up)
  if (rawDy >= -12) {
    state.aim.isValid = false;
    state.aim.pullDistance = 0;
    state.aim.previewPoints = [];
    return;
  }

  const dist = Math.hypot(rawDx, rawDy);
  if (dist < 16) {
    state.aim.isValid = false;
    state.aim.pullDistance = 0;
    state.aim.previewPoints = [];
    return;
  }

  const rawAngle = Math.atan2(-rawDy, rawDx);
  const clampedAngle = clamp(rawAngle, MIN_ANGLE_RAD, MAX_ANGLE_RAD);

  state.aim.isValid = true;
  state.aim.angleRad = clampedAngle;
  state.aim.pullDistance = clamp(dist, 16, 130);
  state.aim.previewPoints = computeAimPreview(state, clampedAngle);
}

export function fireSalvo(state: GameState, angleRad: number): void {
  state.hasTakenFirstShot = true;
  state.launchAngleRad = clamp(angleRad, MIN_ANGLE_RAD, MAX_ANGLE_RAD);
  state.ballsToFire = state.ballCount;
  state.fireCooldown = 0;
  state.nextLaunchX = null;
  state.recallActive = false;
  state.combo = 0;
  state.turnPeakMultiplier = 0;
  state.turnPeakMultiplierTimer = 0;
  state.multiplierHudAlpha = 0;
  state.multiplierHudBump = 0;
  state.multiplierHudResetting = false;
  state.balls = [];
  state.aim.isDragging = false;
  state.aim.isValid = false;
  state.aim.previewPoints = [];
  state.phase = 'FIRING';
}

export function triggerRecall(state: GameState): void {
  if (state.phase !== 'FIRING' && state.phase !== 'FLYING') return;
  state.recallActive = true;
  state.ballsToFire = 0;
  state.phase = 'FLYING';

  for (const ball of state.balls) {
    if (ball.active && !ball.recalling) {
      ball.recalling = true;
      ball.recallStartX = ball.x;
      ball.recallStartY = ball.y;
      ball.recallProgress = 0;
    }
  }
}

function pushParticle(state: GameState, particle: GameState['particles'][number]): void {
  if (state.particles.length >= MAX_PARTICLES) {
    state.particles.shift();
  }
  state.particles.push(particle);
}

function spawnMultiplierPopup(
  state: GameState,
  x: number,
  y: number,
  multiplier: number,
  bonusPoints: number
): void {
  if (state.multiplierPopups.length >= MAX_MULTIPLIER_POPUPS) {
    state.multiplierPopups.shift();
  }
  const color = getChainMultiplierColor(multiplier);
  const maxLife = 0.85;
  state.multiplierPopups.push({
    x: clamp(x, 38, LOGICAL_WIDTH - 38),
    y: clamp(y, 52, FLOOR_Y - 28),
    vy: -56,
    multiplier,
    bonusPoints,
    color,
    life: maxLife,
    maxLife,
  });
}

/**
 * Spawns a dramatic physics-based block destruction burst:
 * 1) Tumbling polygonal debris shards with impact-biased velocities, spin, and bounce
 * 2) High-speed luminous sparks & core flash particles
 */
function spawnBlockDestructionBurst(
  state: GameState,
  block: Block,
  color: string,
  impactVx = 0,
  impactVy = 0,
  intensity = 1
): void {
  const cx = block.x + block.width / 2;
  const cy = block.y + block.height / 2;
  const impactAngle = Math.atan2(impactVy, impactVx);
  const hasImpactDir = Math.hypot(impactVx, impactVy) > 10;

  // 1. Expanding prism shockwave ring
  state.shockwaves.push({
    x: cx,
    y: cy,
    radius: block.width * 0.25,
    maxRadius: block.width * (intensity > 1 ? 1.5 : 1.05),
    color,
    life: 0.28,
    maxLife: 0.28,
  });

  // 2. Tumbling polygonal debris shards (8–12 chunks per brick)
  const shardCount = Math.round(9 * intensity);
  for (let i = 0; i < shardCount; i++) {
    const baseAngle = (Math.PI * 2 * i) / shardCount + (Math.random() - 0.5) * 0.45;
    const speed = (110 + Math.random() * 210) * (0.85 + intensity * 0.25);
    const directionalBias = hasImpactDir ? 0.32 : 0;
    const vx =
      Math.cos(baseAngle) * speed + Math.cos(impactAngle) * speed * directionalBias;
    const vy =
      Math.sin(baseAngle) * speed +
      Math.sin(impactAngle) * speed * directionalBias -
      55; // Slight upward pop before gravity pulls chunks down

    const maxLife = 0.55 + Math.random() * 0.35;
    pushParticle(state, {
      kind: 'shard',
      x: cx + (Math.random() - 0.5) * block.width * 0.55,
      y: cy + (Math.random() - 0.5) * block.height * 0.55,
      vx,
      vy,
      radius: 3.4 + Math.random() * 3.6,
      color: i % 3 === 0 ? '#f8fafc' : color,
      alpha: 1,
      life: maxLife,
      maxLife,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 18,
      sides: block.shape === 'circle' ? 3 : 4,
      stretch: 1.15 + Math.random() * 0.65,
    });
  }

  // 3. Fast glowing sparks
  const sparkCount = Math.round(14 * intensity);
  for (let i = 0; i < sparkCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 150 + Math.random() * 260;
    const maxLife = 0.28 + Math.random() * 0.24;
    pushParticle(state, {
      kind: 'spark',
      x: cx + (Math.random() - 0.5) * 10,
      y: cy + (Math.random() - 0.5) * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.8 + Math.random() * 2.2,
      color: i % 4 === 0 ? '#ffffff' : color,
      alpha: 1,
      life: maxLife,
      maxLife,
      rotation: angle,
      vRot: 0,
      sides: 4,
      stretch: 1,
    });
  }
}

function spawnRadialBurst(
  state: GameState,
  x: number,
  y: number,
  color: string,
  count: number,
  maxRadius = 48
): void {
  state.shockwaves.push({
    x,
    y,
    radius: 6,
    maxRadius,
    color,
    life: 0.28,
    maxLife: 0.28,
  });

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 110 + Math.random() * 220;
    const maxLife = 0.36 + Math.random() * 0.28;
    pushParticle(state, {
      kind: i % 3 === 0 ? 'shard' : 'spark',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      radius: i % 3 === 0 ? 3 + Math.random() * 2.8 : 2 + Math.random() * 2,
      color: i % 4 === 0 ? '#ffffff' : color,
      alpha: 1,
      life: maxLife,
      maxLife,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 16,
      sides: 3,
      stretch: 1.3,
    });
  }
}

function addScaledScore(state: GameState, rawPoints: number): number {
  const mult = Math.max(1, state.dailyScoreMultiplier);
  const total = rawPoints * mult + state.scoreRemainder;
  const whole = Math.floor(total);
  state.scoreRemainder = total - whole;
  state.score += whole;
  return whole;
}

function hitBlock(
  state: GameState,
  block: Block,
  impactVx: number,
  impactVy: number,
  ball: Ball
): void {
  const prevColors = getBlockColors(block.hp);
  block.hp -= 1;
  block.flashTimer = 0.08;
  block.hitScale = 1;
  state.combo += 1;
  addScaledScore(state, 1);

  if (block.hp <= 0) {
    state.blocksDestroyed += 1;
    ball.destroyChain += 1;
    const multiplier = Math.min(MAX_CHAIN_MULTIPLIER, ball.destroyChain);
    state.peakChainThisRun = Math.max(state.peakChainThisRun, multiplier);
    const awardedBonus = addScaledScore(state, 5 * multiplier);

    const traumaBoost = multiplier >= 2 ? Math.min(0.55, 0.38 + (multiplier - 1) * 0.03) : 0.38;
    state.shakeTrauma = Math.min(1, state.shakeTrauma + traumaBoost);
    const impactMag = Math.hypot(impactVx, impactVy);
    if (impactMag > 1) {
      state.shakeKickX = clamp(state.shakeKickX + (impactVx / impactMag) * 3.5, -6, 6);
      state.shakeKickY = clamp(state.shakeKickY + (impactVy / impactMag) * 3.5, -6, 6);
    }

    const burstIntensity = multiplier >= 2 ? Math.min(1.45, 1 + (multiplier - 1) * 0.08) : 1;
    spawnBlockDestructionBurst(state, block, prevColors.stroke, impactVx, impactVy, burstIntensity);

    if (multiplier >= 2) {
      const cx = block.x + block.width / 2;
      const cy = block.y + block.height / 2;
      spawnMultiplierPopup(state, cx, cy - 4, multiplier, awardedBonus);
      if (multiplier > state.turnPeakMultiplier) {
        state.turnPeakMultiplier = multiplier;
      }
      state.turnPeakMultiplierTimer = 1.6;
      state.multiplierHudResetting = false;
      state.multiplierHudBump = 1;
    }

    soundEngine.playBlockDestroy(multiplier);
    hapticsEngine.blockDestroy();
  } else {
    soundEngine.playBlockHit(state.combo);
    hapticsEngine.blockHit();
  }

  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    state.isNewBest = true;
    saveBestScore(state.bestScore);
  }
}

function rotateVelocity(
  vx: number,
  vy: number,
  deltaRad: number
): { vx: number; vy: number } {
  const cos = Math.cos(deltaRad);
  const sin = Math.sin(deltaRad);
  const rvx = vx * cos - vy * sin;
  let rvy = vx * sin + vy * cos;
  if (Math.abs(rvy) < 60) {
    rvy += rvy >= 0 ? 60 : -60;
  }
  const mag = Math.hypot(rvx, rvy) || 1;
  return {
    vx: (rvx / mag) * BALL_SPEED,
    vy: (rvy / mag) * BALL_SPEED,
  };
}

function activatePickup(state: GameState, pickup: Pickup, ball: Ball): void {
  pickup.collected = true;
  state.powerupsCollected += 1;

  if (pickup.type === 'extra_ball') {
    state.pendingExtraBalls += 1;
    spawnRadialBurst(state, pickup.x, pickup.y, '#34d399', 10, 32);
    soundEngine.playPickup();
    hapticsEngine.pickup('extra_ball');
    return;
  }

  if (pickup.type === 'multi_ball') {
    const spread = (22 * Math.PI) / 180;
    const baseCount = state.balls.length;
    let activeTotal = state.balls.filter((b) => b.active && !b.recalling).length;

    for (let i = 0; i < baseCount; i++) {
      const src = state.balls[i];
      if (!src.active || src.recalling) continue;
      if (activeTotal + 2 > MAX_ACTIVE_BALLS) break;

      const left = rotateVelocity(src.vx, src.vy, -spread);
      const right = rotateVelocity(src.vx, src.vy, spread);

      for (const vel of [left, right]) {
        state.balls.push({
          id: state.nextEntityId++,
          x: src.x,
          y: src.y,
          vx: vel.vx,
          vy: vel.vy,
          radius: BALL_RADIUS,
          active: true,
          recalling: false,
          recallStartX: 0,
          recallStartY: 0,
          recallProgress: 0,
          bouncesSinceBlock: 0,
          destroyChain: src.destroyChain,
          trail: [],
        });
      }
      activeTotal += 2;
    }

    state.maxBalls = Math.max(state.maxBalls, activeTotal);
    spawnRadialBurst(state, pickup.x, pickup.y, '#38bdf8', 18, 54);
    soundEngine.playMultiBall();
    hapticsEngine.pickup('multi_ball');
    return;
  }

  if (pickup.type === 'shield') {
    if (state.shields < MAX_SHIELDS) {
      state.shields += 1;
      state.shieldFlashTimer = 0.5;
      state.shieldNoticeText = `AEGIS SHIELD ${state.shields}/${MAX_SHIELDS}`;
      state.shieldNoticeTimer = 1.6;
      spawnRadialBurst(state, pickup.x, pickup.y, '#60a5fa', 18, 52);
    } else {
      // At full shields: unleash an Overcharge Row Pulse damaging blocks in the pickup's row
      let hitAny = false;
      for (const block of state.blocks) {
        if (block.hp <= 0 || block.row !== pickup.row) continue;
        hitAny = true;
        const dmg = Math.min(block.hp, 2);
        const palette = getBlockColors(block.hp);
        block.hp -= dmg;
        block.flashTimer = 0.1;
        block.hitScale = 1;
        addScaledScore(state, dmg);
        if (block.hp <= 0) {
          state.blocksDestroyed += 1;
          addScaledScore(state, 5);
          spawnBlockDestructionBurst(state, block, palette.stroke, 0, 0, 1.15);
        }
      }
      if (!hitAny) {
        addScaledScore(state, 20);
      }
      if (state.score > state.bestScore) {
        state.bestScore = state.score;
        state.isNewBest = true;
        saveBestScore(state.bestScore);
      }
      state.shieldFlashTimer = 0.45;
      state.shieldNoticeText = 'SHIELD OVERCHARGE · +PULSE';
      state.shieldNoticeTimer = 1.5;
      spawnRadialBurst(state, pickup.x, pickup.y, '#818cf8', 22, 60);
    }
    soundEngine.playShieldGain();
    hapticsEngine.pickup('shield');
    return;
  }

  // Bomb power-up: destroys all adjacent bricks in 3x3 grid neighborhood
  state.bombsDetonated += 1;
  let destroyed = 0;
  let totalBombBonus = 0;
  for (const block of state.blocks) {
    if (block.hp <= 0) continue;
    if (
      Math.abs(block.col - pickup.col) <= 1 &&
      Math.abs(block.row - pickup.row) <= 1
    ) {
      const palette = getBlockColors(block.hp);
      state.blocksDestroyed += 1;
      ball.destroyChain += 1;
      const mult = Math.min(MAX_CHAIN_MULTIPLIER, ball.destroyChain);
      state.peakChainThisRun = Math.max(state.peakChainThisRun, mult);
      const awarded = addScaledScore(state, block.hp + 5 * mult);
      totalBombBonus += awarded;
      block.hp = 0;
      destroyed += 1;

      const bx = block.x + block.width / 2;
      const by = block.y + block.height / 2;
      spawnBlockDestructionBurst(
        state,
        block,
        palette.stroke,
        bx - pickup.x,
        by - pickup.y,
        1.35
      );
    }
  }

  if (destroyed > 0) {
    const peakMult = Math.min(MAX_CHAIN_MULTIPLIER, ball.destroyChain);
    if (peakMult >= 2) {
      spawnMultiplierPopup(state, pickup.x, pickup.y - 6, peakMult, totalBombBonus);
      if (peakMult > state.turnPeakMultiplier) {
        state.turnPeakMultiplier = peakMult;
      }
      state.turnPeakMultiplierTimer = 1.6;
      state.multiplierHudResetting = false;
      state.multiplierHudBump = 1;
    }
  }

  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    state.isNewBest = true;
    saveBestScore(state.bestScore);
  }

  state.shakeTrauma = Math.min(1, state.shakeTrauma + (destroyed > 0 ? 0.85 : 0.55));
  spawnRadialBurst(state, pickup.x, pickup.y, '#fb923c', 26, ROW_STEP * 1.45);
  soundEngine.playBombExplosion();
  hapticsEngine.pickup('bomb');
}

function recordBallTrail(ball: Ball, effectiveSpeed: number): void {
  const speedNorm = clamp(effectiveSpeed / BALL_SPEED, 0.5, 2.8);
  const maxPoints = Math.round(clamp(7 + speedNorm * 8, 8, 28));
  const last = ball.trail[ball.trail.length - 1];
  if (!last || Math.hypot(ball.x - last.x, ball.y - last.y) >= 2.5) {
    ball.trail.push({ x: ball.x, y: ball.y });
  }
  while (ball.trail.length > maxPoints) {
    ball.trail.shift();
  }
}

function pushBounceVertex(ball: Ball): void {
  const last = ball.trail[ball.trail.length - 1];
  if (!last || Math.hypot(ball.x - last.x, ball.y - last.y) >= 2.5) {
    ball.trail.push({ x: ball.x, y: ball.y });
  }
}

function stepBallSubstep(state: GameState, ball: Ball, subDt: number): void {
  ball.x += ball.vx * subDt;
  ball.y += ball.vy * subDt;

  let hitWall = false;
  if (ball.x - ball.radius < 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
    hitWall = true;
  } else if (ball.x + ball.radius > LOGICAL_WIDTH) {
    ball.x = LOGICAL_WIDTH - ball.radius;
    ball.vx = -Math.abs(ball.vx);
    hitWall = true;
  }

  if (ball.y - ball.radius < 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    hitWall = true;
  }

  if (hitWall) {
    ball.bouncesSinceBlock += 1;
    pushBounceVertex(ball);
    soundEngine.playWallBounce();
    if (ball.bouncesSinceBlock > 16 && Math.abs(ball.vy) < 70) {
      ball.vy += 65;
      const mag = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / mag) * BALL_SPEED;
      ball.vy = (ball.vy / mag) * BALL_SPEED;
    }
  }

  // Floor return
  if (ball.y + ball.radius >= FLOOR_Y && ball.vy > 0) {
    ball.active = false;
    const landedX = clamp(ball.x, BALL_RADIUS + 8, LOGICAL_WIDTH - BALL_RADIUS - 8);
    if (state.nextLaunchX === null) {
      state.nextLaunchX = landedX;
    }
    return;
  }

  // Pickups
  for (const pickup of state.pickups) {
    if (pickup.collected) continue;
    const dx = ball.x - pickup.x;
    const dy = ball.y - pickup.y;
    const hitDist = ball.radius + pickup.radius + 3;
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      activatePickup(state, pickup, ball);
    }
  }

  // Blocks
  for (const block of state.blocks) {
    if (block.hp <= 0) continue;

    if (block.shape === 'rect') {
      const cx = clamp(ball.x, block.x, block.x + block.width);
      const cy = clamp(ball.y, block.y, block.y + block.height);
      const dx = ball.x - cx;
      const dy = ball.y - cy;
      const d2 = dx * dx + dy * dy;

      if (d2 < ball.radius * ball.radius) {
        let nx = 0;
        let ny = 0;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          nx = dx / d;
          ny = dy / d;
          ball.x = cx + nx * ball.radius;
          ball.y = cy + ny * ball.radius;
        } else {
          nx = 0;
          ny = 1;
          ball.y = block.y + block.height + ball.radius;
        }

        const impactVx = ball.vx;
        const impactVy = ball.vy;
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          const mag = Math.hypot(ball.vx, ball.vy) || 1;
          ball.vx = (ball.vx / mag) * BALL_SPEED;
          ball.vy = (ball.vy / mag) * BALL_SPEED;
        }
        ball.bouncesSinceBlock = 0;
        pushBounceVertex(ball);
        hitBlock(state, block, impactVx, impactVy, ball);
      }
    } else {
      const bx = block.x + block.width / 2;
      const by = block.y + block.height / 2;
      const br = block.width * 0.45;
      const dx = ball.x - bx;
      const dy = ball.y - by;
      const minD = ball.radius + br;
      const d2 = dx * dx + dy * dy;

      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d;
        const ny = dy / d;
        ball.x = bx + nx * minD;
        ball.y = by + ny * minD;

        const impactVx = ball.vx;
        const impactVy = ball.vy;
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
          ball.vx -= 2 * dot * nx;
          ball.vy -= 2 * dot * ny;
          const mag = Math.hypot(ball.vx, ball.vy) || 1;
          ball.vx = (ball.vx / mag) * BALL_SPEED;
          ball.vy = (ball.vy / mag) * BALL_SPEED;
        }
        ball.bouncesSinceBlock = 0;
        pushBounceVertex(ball);
        hitBlock(state, block, impactVx, impactVy, ball);
      }
    }
  }
}

function finishTurn(state: GameState): void {
  if (state.nextLaunchX !== null) {
    state.launchX = state.nextLaunchX;
  }
  state.nextLaunchX = null;
  state.ballCount += state.pendingExtraBalls;
  state.maxBalls = Math.max(state.maxBalls, state.ballCount);
  state.pendingExtraBalls = 0;
  state.balls = [];
  state.recallActive = false;
  state.combo = 0;
  if (state.turnPeakMultiplier >= 2) {
    state.multiplierHudResetting = true;
  }
  state.turn += 1;

  const nextTier = getDifficultyTier(state.turn);
  if (nextTier > state.difficultyTier) {
    state.difficultyTier = nextTier;
    state.tierBannerText = `Tier ${nextTier} · Difficulty Escalated`;
    state.tierBannerTimer = 2.2;
  }

  for (const block of state.blocks) {
    block.row += 1;
  }
  for (const pickup of state.pickups) {
    pickup.row += 1;
  }

  spawnRow(state, true);
  state.phase = 'SHIFTING';
  state.shiftTimer = SHIFT_DURATION;
}

export function stepGame(state: GameState, rawDt: number): boolean {
  const dt = Math.min(rawDt, 0.05);
  let snapshotChanged = false;

  // Tier escalation banner, shield status & floating top-center multiplier HUD animation
  if (state.tierBannerTimer > 0) {
    state.tierBannerTimer = Math.max(0, state.tierBannerTimer - dt);
  }
  if (state.shieldFlashTimer > 0) {
    state.shieldFlashTimer = Math.max(0, state.shieldFlashTimer - dt);
  }
  if (state.shieldNoticeTimer > 0) {
    state.shieldNoticeTimer = Math.max(0, state.shieldNoticeTimer - dt);
  }
  if (state.turnPeakMultiplierTimer > 0) {
    state.turnPeakMultiplierTimer = Math.max(0, state.turnPeakMultiplierTimer - dt);
  }
  state.multiplierHudPhase += dt;
  if (state.multiplierHudBump > 0) {
    state.multiplierHudBump = Math.max(0, state.multiplierHudBump - dt * 4.5);
  }
  if (!state.multiplierHudResetting && state.turnPeakMultiplier >= 2) {
    state.multiplierHudAlpha = Math.min(1, state.multiplierHudAlpha + dt * 7);
  } else if (state.multiplierHudAlpha > 0) {
    state.multiplierHudAlpha = Math.max(0, state.multiplierHudAlpha - dt * 1.9);
    if (state.multiplierHudAlpha <= 0) {
      state.turnPeakMultiplier = 0;
      state.multiplierHudResetting = false;
    }
  }

  // Floating trajectory multiplier popups
  for (let i = state.multiplierPopups.length - 1; i >= 0; i--) {
    const pop = state.multiplierPopups[i];
    pop.life -= dt;
    if (pop.life <= 0) {
      state.multiplierPopups.splice(i, 1);
      continue;
    }
    pop.y += pop.vy * dt;
    pop.vy *= Math.exp(-3.2 * dt);
  }

  // Screen shake trauma & directional kick decay
  if (state.shakeTrauma > 0) {
    state.shakeTrauma = Math.max(0, state.shakeTrauma - dt * 2.6);
  }
  if (Math.abs(state.shakeKickX) > 0.01 || Math.abs(state.shakeKickY) > 0.01) {
    const damp = Math.exp(-16 * dt);
    state.shakeKickX *= damp;
    state.shakeKickY *= damp;
  } else {
    state.shakeKickX = 0;
    state.shakeKickY = 0;
  }

  // Expanding shockwave rings
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const sw = state.shockwaves[i];
    sw.life -= dt;
    if (sw.life <= 0) {
      state.shockwaves.splice(i, 1);
      continue;
    }
    const progress = 1 - sw.life / sw.maxLife;
    const ease = 1 - Math.pow(1 - progress, 2);
    sw.radius = sw.maxRadius * ease;
  }

  // Physics-based debris shards & glowing sparks
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }

    if (p.kind === 'shard') {
      // Gravity & spin for tumbling brick fragments
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      p.vx *= 0.985;

      // Bounce debris off arena side walls & floor line
      if (p.x - p.radius < 0) {
        p.x = p.radius;
        p.vx = Math.abs(p.vx) * 0.65;
        p.vRot *= -0.7;
      } else if (p.x + p.radius > LOGICAL_WIDTH) {
        p.x = LOGICAL_WIDTH - p.radius;
        p.vx = -Math.abs(p.vx) * 0.65;
        p.vRot *= -0.7;
      }
      if (p.y + p.radius > FLOOR_Y) {
        p.y = FLOOR_Y - p.radius;
        p.vy = -Math.abs(p.vy) * 0.42;
        p.vx *= 0.78;
        p.vRot *= 0.6;
      }
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    p.alpha = clamp(p.life / p.maxLife, 0, 1);
  }

  // Block hit flash & pop decay
  for (const block of state.blocks) {
    if (block.flashTimer > 0) {
      block.flashTimer = Math.max(0, block.flashTimer - dt);
    }
    if (block.hitScale > 0) {
      block.hitScale = Math.max(0, block.hitScale - dt * 9);
    }
  }

  // Pickup idle pulse
  for (const pickup of state.pickups) {
    pickup.pulsePhase += dt * 4;
  }

  if (state.phase === 'AIMING' || state.phase === 'GAME_OVER') {
    return false;
  }

  if (state.phase === 'SHIFTING') {
    state.shiftTimer = Math.max(0, state.shiftTimer - dt);
    const t = 1 - state.shiftTimer / SHIFT_DURATION;
    const ease = 1 - Math.pow(1 - t, 3);

    for (const block of state.blocks) {
      const fromY = rowToY(block.row - 1);
      const toY = rowToY(block.row);
      block.y = fromY + (toY - fromY) * ease;
    }
    for (const pickup of state.pickups) {
      const fromY = rowToY(pickup.row - 1) + CELL_SIZE / 2;
      const toY = rowToY(pickup.row) + CELL_SIZE / 2;
      pickup.y = fromY + (toY - fromY) * ease;
    }

    if (state.shiftTimer <= 0) {
      for (const block of state.blocks) {
        block.y = rowToY(block.row);
      }
      for (let i = state.pickups.length - 1; i >= 0; i--) {
        const p = state.pickups[i];
        if (p.row >= DANGER_ROW) {
          state.pickups.splice(i, 1);
        } else {
          p.y = rowToY(p.row) + CELL_SIZE / 2;
        }
      }

      const breachingBlocks = state.blocks.filter((b) => b.row >= DANGER_ROW);
      if (breachingBlocks.length > 0) {
        if (state.shields > 0) {
          state.shields -= 1;
          state.shieldFlashTimer = 0.8;
          state.shieldNoticeText =
            state.shields > 0
              ? `SHIELD SAVED · ${state.shields} LEFT`
              : 'SHIELD SHATTERED · BREACH CLEARED';
          state.shieldNoticeTimer = 2.3;
          state.shakeTrauma = Math.min(1, state.shakeTrauma + 0.88);

          for (const block of breachingBlocks) {
            const bx = block.x + block.width / 2;
            state.blocksDestroyed += 1;
            addScaledScore(state, Math.max(5, block.hp));
            block.hp = 0;
            spawnBlockDestructionBurst(state, block, '#38bdf8', 0, -240, 1.35);
            spawnRadialBurst(state, bx, DANGER_Y, '#818cf8', 12, ROW_STEP * 1.15);
          }

          for (let i = state.blocks.length - 1; i >= 0; i--) {
            if (state.blocks[i].hp <= 0) {
              state.blocks.splice(i, 1);
            }
          }

          if (state.score > state.bestScore) {
            state.bestScore = state.score;
            state.isNewBest = true;
            saveBestScore(state.bestScore);
          }

          soundEngine.playShieldTrigger();
          hapticsEngine.shieldTrigger();
          state.phase = 'AIMING';
        } else {
          state.phase = 'GAME_OVER';
          soundEngine.playGameOver();
          hapticsEngine.gameOver();
          if (state.score > state.bestScore) {
            state.bestScore = state.score;
            state.isNewBest = true;
            saveBestScore(state.bestScore);
          }
        }
      } else {
        state.phase = 'AIMING';
      }
      snapshotChanged = true;
    }
    return snapshotChanged;
  }

  // FIRING or FLYING phase
  const speedMult = state.fastForward ? 2 : 1;
  const simDt = dt * speedMult;

  if (state.phase === 'FIRING' && !state.recallActive) {
    state.fireCooldown -= simDt;
    while (state.fireCooldown <= 0 && state.ballsToFire > 0) {
      state.balls.push({
        id: state.nextEntityId++,
        x: state.launchX,
        y: FLOOR_Y - BALL_RADIUS,
        vx: Math.cos(state.launchAngleRad) * BALL_SPEED,
        vy: -Math.sin(state.launchAngleRad) * BALL_SPEED,
        radius: BALL_RADIUS,
        active: true,
        recalling: false,
        recallStartX: 0,
        recallStartY: 0,
        recallProgress: 0,
        bouncesSinceBlock: 0,
        destroyChain: 0,
        trail: [],
      });

      if (state.ballsToFire === state.ballCount || state.ballsToFire % 4 === 0) {
        soundEngine.playLaunch();
      }
      state.ballsToFire -= 1;
      state.fireCooldown += FIRE_INTERVAL;
      snapshotChanged = true;
    }

    if (state.ballsToFire <= 0) {
      state.phase = 'FLYING';
      snapshotChanged = true;
    }
  }

  const targetX = state.nextLaunchX ?? state.launchX;
  const targetY = FLOOR_Y - BALL_RADIUS;

  const maxStep = BALL_RADIUS * 0.45;
  const frameDist = BALL_SPEED * simDt;
  const subSteps = Math.max(1, Math.ceil(frameDist / maxStep));
  const subDt = simDt / subSteps;

  const initialCount = state.balls.length;
  for (let i = 0; i < initialCount; i++) {
    const ball = state.balls[i];
    if (!ball.active) continue;

    if (ball.recalling) {
      const prevX = ball.x;
      const prevY = ball.y;
      ball.recallProgress = Math.min(1, ball.recallProgress + dt / RECALL_DURATION);
      const ease = ball.recallProgress * ball.recallProgress;
      ball.x = ball.recallStartX + (targetX - ball.recallStartX) * ease;
      ball.y = ball.recallStartY + (targetY - ball.recallStartY) * ease;
      if (dt > 1e-4) {
        ball.vx = (ball.x - prevX) / dt;
        ball.vy = (ball.y - prevY) / dt;
      }
      recordBallTrail(ball, Math.hypot(ball.vx, ball.vy));

      if (ball.recallProgress >= 1) {
        ball.active = false;
      }
      continue;
    }

    const prevScore = state.score;
    const prevExtra = state.pendingExtraBalls;
    for (let s = 0; s < subSteps; s++) {
      if (!ball.active) break;
      stepBallSubstep(state, ball, subDt);
    }

    if (state.score !== prevScore || state.pendingExtraBalls !== prevExtra) {
      snapshotChanged = true;
    }

    if (ball.active) {
      recordBallTrail(ball, BALL_SPEED * speedMult);
    }
  }

  // Cleanup destroyed blocks & collected pickups
  for (let i = state.blocks.length - 1; i >= 0; i--) {
    if (state.blocks[i].hp <= 0) {
      state.blocks.splice(i, 1);
      snapshotChanged = true;
    }
  }
  for (let i = state.pickups.length - 1; i >= 0; i--) {
    if (state.pickups[i].collected) {
      state.pickups.splice(i, 1);
      snapshotChanged = true;
    }
  }

  if (state.ballsToFire <= 0 && state.balls.every((b) => !b.active)) {
    finishTurn(state);
    snapshotChanged = true;
  }

  return snapshotChanged;
}

export function restoreGameStateFromSnapshot(
  snapshot: {
    score: number;
    bestScore: number;
    turn: number;
    ballCount: number;
    launchX: number;
    powerupsCollected: number;
    maxBalls: number;
    peakChainThisRun: number;
    blocksDestroyed: number;
    bombsDetonated: number;
    scoreRemainder: number;
    difficultyTier: number;
    shields?: number;
    nextEntityId: number;
    blocks: GameState['blocks'];
    pickups: GameState['pickups'];
  },
  dailyScoreMultiplier = 1
): GameState {
  const bestScore = Math.max(loadBestScore(), snapshot.bestScore || 0);
  return {
    phase: 'AIMING',
    score: snapshot.score,
    bestScore,
    turn: snapshot.turn,
    ballCount: snapshot.ballCount,
    pendingExtraBalls: 0,
    powerupsCollected: snapshot.powerupsCollected,
    maxBalls: snapshot.maxBalls,
    launchX: snapshot.launchX,
    nextLaunchX: null,
    launchAngleRad: Math.PI / 2,
    ballsToFire: 0,
    fireCooldown: 0,
    fastForward: false,
    recallActive: false,
    shiftTimer: 0,
    shakeTrauma: 0,
    shakeKickX: 0,
    shakeKickY: 0,
    combo: 0,
    turnPeakMultiplier: 0,
    turnPeakMultiplierTimer: 0,
    multiplierHudAlpha: 0,
    multiplierHudBump: 0,
    multiplierHudPhase: 0,
    multiplierHudResetting: false,
    peakChainThisRun: snapshot.peakChainThisRun,
    blocksDestroyed: snapshot.blocksDestroyed,
    bombsDetonated: snapshot.bombsDetonated,
    dailyScoreMultiplier: Math.max(1, dailyScoreMultiplier),
    scoreRemainder: snapshot.scoreRemainder,
    isNewBest: snapshot.score > 0 && snapshot.score >= bestScore,
    hasTakenFirstShot: true,
    difficultyTier: snapshot.difficultyTier || getDifficultyTier(snapshot.turn),
    tierBannerText: null,
    tierBannerTimer: 0,
    shields:
      typeof snapshot.shields === 'number'
        ? clamp(snapshot.shields, 0, MAX_SHIELDS)
        : 1,
    shieldFlashTimer: 0,
    shieldNoticeText: null,
    shieldNoticeTimer: 0,
    nextEntityId: snapshot.nextEntityId,
    blocks: snapshot.blocks.map((b) => ({ ...b, flashTimer: 0, hitScale: 0 })),
    pickups: snapshot.pickups.map((p) => ({ ...p })),
    balls: [],
    particles: [],
    shockwaves: [],
    multiplierPopups: [],
    aim: {
      isDragging: false,
      isValid: false,
      angleRad: Math.PI / 2,
      pullDistance: 0,
      previewPoints: [],
    },
  };
}

export function getCellGap(): number {
  return CELL_GAP;
}
