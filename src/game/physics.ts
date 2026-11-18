import { ComboVoiceTier, soundEngine } from './audio.ts';
import { getBlockColors, getChainMultiplierColor } from './colors.ts';
import {
  DAILY_REWARD_MULTIPLIER_BOOST,
  DAILY_REWARD_SHIELD_COUNT,
} from './dailyReward.ts';
import { hapticsEngine } from './haptics.ts';
import {
  BALL_RADIUS,
  BALL_SPEED,
  BEST_SCORE_KEY,
  Ball,
  Block,
  BlockShape,
  BuffType,
  CELL_GAP,
  CELL_SIZE,
  COLS,
  DANGER_ROW,
  DANGER_Y,
  DIFFICULTY_CONFIGS,
  DailyRewardChoice,
  DifficultyMode,
  FIRE_INTERVAL,
  FLOOR_Y,
  FloatingBuff,
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

function getComboVoiceTier(combo: number): ComboVoiceTier | 0 {
  if (combo >= 12) return 4;
  if (combo >= 9) return 3;
  if (combo >= 6) return 2;
  if (combo >= 4) return 1;
  return 0;
}

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

export interface StageMetadata {
  stage: number;
  title: string;
  speedMult: number;
  fireCadenceMult: number;
  shiftSpeedMult: number;
}

const STAGE_TITLES = [
  'Sector Entry',
  'Twin Flanks',
  'Choke Gate',
  'Vanguard Wedge',
  'Siege Gauntlet',
  'Overclock Apex',
];

export function getDifficultyTier(
  turn: number,
  difficultyMode: DifficultyMode = 'standard'
): number {
  return 1 + Math.floor(turn / 5) + DIFFICULTY_CONFIGS[difficultyMode].startTierOffset;
}

export function getStageMetadata(stage: number): StageMetadata {
  const s = Math.max(1, Math.floor(stage));
  const title = STAGE_TITLES[Math.min(STAGE_TITLES.length - 1, s - 1)];
  const speedMult =
    s <= 5
      ? Number((1 + (s - 1) * 0.09).toFixed(2))
      : Number(Math.min(1.6, 1.36 + (s - 5) * 0.07).toFixed(2));
  const fireCadenceMult =
    s <= 5
      ? Number((1 + (s - 1) * 0.07).toFixed(2))
      : Number(Math.min(1.45, 1.28 + (s - 5) * 0.04).toFixed(2));
  const shiftSpeedMult =
    s <= 5
      ? Number((1 + (s - 1) * 0.06).toFixed(2))
      : Number(Math.min(1.36, 1.24 + (s - 5) * 0.03).toFixed(2));

  return {
    stage: s,
    title,
    speedMult,
    fireCadenceMult,
    shiftSpeedMult,
  };
}

function getCurrentBallSpeed(state: GameState): number {
  return BALL_SPEED * Math.max(1, state.stageSpeedMult || 1);
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
  vanguardChance: number;
  maxVanguards: number;
}

function getTierProfile(turn: number, difficultyMode: DifficultyMode): TierProfile {
  const cfg = DIFFICULTY_CONFIGS[difficultyMode];
  const tier = getDifficultyTier(turn, difficultyMode);
  let base: TierProfile;

  if (tier === 1) {
    base = {
      tier,
      baseHpMult: 1.0,
      circleChance: turn >= 2 ? 0.22 : 0,
      doubleChance: turn >= 3 ? 0.14 : 0,
      tripleChance: 0,
      minBlocks: turn <= 2 ? 2 : 3,
      maxBlocks: turn <= 2 ? 3 : 4,
      specialChance: turn === 1 ? 0.55 : 0.6,
      vanguardChance: 0,
      maxVanguards: 0,
    };
  } else if (tier === 2) {
    base = {
      tier,
      baseHpMult: 1.18,
      circleChance: 0.32,
      doubleChance: 0.26,
      tripleChance: 0.06,
      minBlocks: 3,
      maxBlocks: 5,
      specialChance: 0.64,
      vanguardChance: 0,
      maxVanguards: 0,
    };
  } else if (tier === 3) {
    base = {
      tier,
      baseHpMult: 1.38,
      circleChance: 0.4,
      doubleChance: 0.34,
      tripleChance: 0.16,
      minBlocks: 4,
      maxBlocks: 5,
      specialChance: 0.68,
      vanguardChance: 0.35,
      maxVanguards: 1,
    };
  } else if (tier === 4) {
    base = {
      tier,
      baseHpMult: 1.58,
      circleChance: 0.46,
      doubleChance: 0.38,
      tripleChance: 0.24,
      minBlocks: 4,
      maxBlocks: 6,
      specialChance: 0.7,
      vanguardChance: 0.58,
      maxVanguards: 1,
    };
  } else {
    base = {
      tier,
      baseHpMult: 1.58 + (tier - 4) * 0.28,
      circleChance: Math.min(0.58, 0.48 + (tier - 4) * 0.04),
      doubleChance: 0.42,
      tripleChance: Math.min(0.38, 0.26 + (tier - 4) * 0.04),
      minBlocks: 5,
      maxBlocks: 6,
      specialChance: 0.74,
      vanguardChance: Math.min(0.85, 0.65 + (tier - 5) * 0.08),
      maxVanguards: 2,
    };
  }

  return {
    ...base,
    baseHpMult: base.baseHpMult * cfg.hpMult,
    specialChance: clamp(base.specialChance + cfg.specialChanceBonus, 0.45, 0.85),
  };
}

function pickTieredLayout(
  tier: number,
  turn: number,
  hasSpecial: boolean
): {
  pickupCols: number[];
  blockCols: number[];
  vanguardPreferredCols: number[];
} {
  const shuffled = shuffleCols();
  const maxAvailableBlocks = hasSpecial ? COLS - 2 : COLS - 1;

  // Stage 1: organic staggered scatter
  if (tier === 1) {
    const pickupCols = hasSpecial ? [shuffled[0], shuffled[1]] : [shuffled[0]];
    return {
      pickupCols,
      blockCols: shuffled.slice(pickupCols.length),
      vanguardPreferredCols: [],
    };
  }

  // Milestone turns (10, 20, 30...) deploy a fortified Siege Wall
  if (turn % 10 === 0) {
    const gapCol = 1 + Math.floor(Math.random() * (COLS - 2));
    const specialCol = gapCol <= 3 ? 5 : 1;
    const pickupCols = hasSpecial ? [gapCol, specialCol] : [gapCol];
    const blockCols = Array.from({ length: COLS }, (_, c) => c).filter(
      (c) => !pickupCols.includes(c)
    );
    return {
      pickupCols,
      blockCols: blockCols.slice(0, maxAvailableBlocks),
      vanguardPreferredCols: [gapCol === 3 ? 2 : 3],
    };
  }

  // Stage 2: Twin Flanks or Staggered Checkerboard
  if (tier === 2) {
    if (Math.random() < 0.55) {
      const centerCandidates = [2, 3, 4].sort(() => Math.random() - 0.5);
      const pickupCols = hasSpecial ? centerCandidates.slice(0, 2) : [centerCandidates[0]];
      const wingCols = [0, 1, 5, 6, 2, 3, 4].filter((c) => !pickupCols.includes(c));
      return {
        pickupCols,
        blockCols: wingCols.slice(0, maxAvailableBlocks),
        vanguardPreferredCols: [],
      };
    }
    const oddCols = [1, 3, 5].sort(() => Math.random() - 0.5);
    const pickupCols = hasSpecial ? oddCols.slice(0, 2) : [oddCols[0]];
    const blockCols = [0, 2, 4, 6, 1, 3, 5].filter((c) => !pickupCols.includes(c));
    return {
      pickupCols,
      blockCols: blockCols.slice(0, maxAvailableBlocks),
      vanguardPreferredCols: [],
    };
  }

  // Stage 3+: Choke Gate, Split Pillars, Fortress Wings, or Vanguard Wedge
  const patternRoll = Math.random();
  if (patternRoll < 0.3) {
    // Choke Gate: dense center cluster forcing bank shots off the side walls
    const edgeCandidates = [0, 6, 1, 5].sort(() => Math.random() - 0.5);
    const pickupCols = hasSpecial ? edgeCandidates.slice(0, 2) : [edgeCandidates[0]];
    const gateCols = [2, 3, 4, 1, 5, 0, 6].filter((c) => !pickupCols.includes(c));
    return {
      pickupCols,
      blockCols: gateCols.slice(0, maxAvailableBlocks),
      vanguardPreferredCols: [3, 2, 4],
    };
  }
  if (patternRoll < 0.6) {
    // Split Pillars: twin armored lanes with shielded center pocket
    const laneCandidates = [1, 5, 3].sort(() => Math.random() - 0.5);
    const pickupCols = hasSpecial ? laneCandidates.slice(0, 2) : [laneCandidates[0]];
    const pillarCols = [0, 3, 6, 2, 4, 1, 5].filter((c) => !pickupCols.includes(c));
    return {
      pickupCols,
      blockCols: pillarCols.slice(0, maxAvailableBlocks),
      vanguardPreferredCols: [2, 4, 3],
    };
  }
  if (patternRoll < 0.85) {
    // Fortress Wings: outer bastions + center pickups
    const centerCandidates = [2, 3, 4].sort(() => Math.random() - 0.5);
    const pickupCols = hasSpecial ? centerCandidates.slice(0, 2) : [centerCandidates[0]];
    const wingCols = [0, 1, 5, 6, 2, 3, 4].filter((c) => !pickupCols.includes(c));
    return {
      pickupCols,
      blockCols: wingCols.slice(0, maxAvailableBlocks),
      vanguardPreferredCols: [1, 5, 3],
    };
  }

  // Zigzag / Staggered Bastion
  const oddCols = [1, 3, 5].sort(() => Math.random() - 0.5);
  const pickupCols = hasSpecial ? oddCols.slice(0, 2) : [oddCols[0]];
  const blockCols = [0, 2, 4, 6, 1, 3, 5].filter((c) => !pickupCols.includes(c));
  return {
    pickupCols,
    blockCols: blockCols.slice(0, maxAvailableBlocks),
    vanguardPreferredCols: [1, 3, 5],
  };
}

export function createInitialGameState(
  dailyScoreMultiplier = 1,
  difficultyMode: DifficultyMode = 'standard',
  dailyRewardBonus: DailyRewardChoice | null = null
): GameState {
  const bestScore = loadBestScore();
  const cfg = DIFFICULTY_CONFIGS[difficultyMode];
  const initialStage = getDifficultyTier(1, difficultyMode);
  const stageMeta = getStageMetadata(initialStage);
  const rewardMultBonus =
    dailyRewardBonus === 'multiplier_boost' ? DAILY_REWARD_MULTIPLIER_BOOST : 0;
  const effectiveMultiplier =
    Math.round((Math.max(1, dailyScoreMultiplier) + rewardMultBonus) * 100) / 100;
  const startingShields =
    dailyRewardBonus === 'starter_shield'
      ? Math.min(MAX_SHIELDS + 1, cfg.startingShields + DAILY_REWARD_SHIELD_COUNT)
      : cfg.startingShields;
  const rewardNotice =
    dailyRewardBonus === 'multiplier_boost'
      ? `DAILY REWARD · +${DAILY_REWARD_MULTIPLIER_BOOST.toFixed(2)}× BOOST`
      : dailyRewardBonus === 'starter_shield'
        ? 'DAILY REWARD · +1 STARTER SHIELD'
        : null;
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
    trajectoryCombo: 0,
    trajectoryComboBump: 0,
    turnPeakMultiplier: 0,
    turnPeakMultiplierTimer: 0,
    multiplierHudAlpha: 0,
    multiplierHudBump: 0,
    multiplierHudPhase: 0,
    multiplierHudResetting: false,
    peakChainThisRun: 0,
    blocksDestroyed: 0,
    bombsDetonated: 0,
    dailyScoreMultiplier: effectiveMultiplier,
    dailyRewardBonus,
    scoreRemainder: 0,
    isNewBest: false,
    hasTakenFirstShot: false,
    difficultyMode,
    difficultyTier: initialStage,
    stageSpeedMult: stageMeta.speedMult,
    tierBannerText:
      initialStage > 1
        ? `STAGE ${initialStage} · ${stageMeta.title.toUpperCase()} (${stageMeta.speedMult.toFixed(2)}× SPD)`
        : null,
    tierBannerTimer: initialStage > 1 ? 2.2 : 0,
    shields: startingShields,
    shieldSavesThisRun: 0,
    shieldFlashTimer: dailyRewardBonus === 'starter_shield' ? 0.55 : 0,
    shieldNoticeText: rewardNotice,
    shieldNoticeTimer: rewardNotice ? 2.6 : 0,
    buffMultiBallTurns: 0,
    buffShieldExpandTurns: 0,
    nextEntityId: 1,
    blocks: [],
    pickups: [],
    floatingBuffs: [],
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
  const profile = getTierProfile(state.turn, state.difficultyMode);
  const y = animateEntry ? rowToY(-1) : rowToY(0);
  const spawnSpecial = Math.random() < profile.specialChance;
  const { pickupCols, blockCols, vanguardPreferredCols } = pickTieredLayout(
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
  const hasPowerupBrickOnBoard = state.blocks.some(
    (b) => b.hp > 0 && b.kind === 'powerup'
  );
  const powerupBrickChance =
    state.difficultyMode === 'relaxed' ? 0.2 : 0.16;
  const shouldSpawnPowerupBrick =
    !isMilestone &&
    !hasPowerupBrickOnBoard &&
    count >= 2 &&
    Math.random() < powerupBrickChance;
  const powerupIndex = shouldSpawnPowerupBrick
    ? Math.floor(Math.random() * Math.min(count, blockCols.length))
    : -1;

  for (let i = 0; i < count && i < blockCols.length; i++) {
    const col = blockCols[i];
    const roll = Math.random();
    const isPowerupBrick = i === powerupIndex;

    let hpMult = 1;
    if (isMilestone && i === 0) {
      hpMult = Math.min(4, 2 + Math.floor(profile.tier / 2)); // Keystone boss brick on every 10th turn
    } else if (state.turn % 5 === 0 && i === 0) {
      hpMult = 2;
    } else if (!isPowerupBrick && roll < profile.tripleChance) {
      hpMult = 3;
    } else if (!isPowerupBrick && roll < profile.tripleChance + profile.doubleChance) {
      hpMult = 2;
    }

    const hp = Math.max(1, Math.round(baseHp * (isPowerupBrick ? 1.15 : hpMult)));
    const armored = !isPowerupBrick && hpMult >= 2;
    const shape: BlockShape = isPowerupBrick
      ? 'rect'
      : Math.random() < profile.circleChance
        ? 'circle'
        : 'rect';
    const powerupReward: BuffType | undefined = isPowerupBrick
      ? Math.random() < (state.shields === 0 ? 0.58 : 0.45)
        ? 'shield_expansion'
        : 'multi_ball'
      : undefined;

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
      kind: isPowerupBrick ? 'powerup' : 'standard',
      powerupReward,
      armored,
      flashTimer: 0,
      hitScale: 0,
    };
    state.blocks.push(block);
  }

  // Stage 3+: Spawn 1-2 armored vanguard bumper bricks in unoccupied row-1 cells for multi-row formations
  if (
    animateEntry &&
    profile.maxVanguards > 0 &&
    Math.random() < profile.vanguardChance
  ) {
    let placed = 0;
    const candidates =
      vanguardPreferredCols.length > 0 ? vanguardPreferredCols : shuffleCols();
    for (const col of candidates) {
      if (placed >= profile.maxVanguards) break;
      const occupiedByBlock = state.blocks.some(
        (b) => b.hp > 0 && b.col === col && b.row === 1
      );
      const occupiedByPickup = state.pickups.some(
        (p) => !p.collected && p.col === col && p.row === 1
      );
      if (occupiedByBlock || occupiedByPickup) continue;

      const vanguardHp = Math.max(2, Math.round(baseHp * 1.4));
      state.blocks.push({
        id: state.nextEntityId++,
        col,
        row: 1,
        x: colToX(col),
        y: rowToY(0), // Slides smoothly from row 0 to row 1 during SHIFTING
        width: CELL_SIZE,
        height: CELL_SIZE,
        hp: vanguardHp,
        maxHp: vanguardHp,
        shape: 'circle',
        armored: true,
        flashTimer: 0,
        hitScale: 0,
      });
      placed += 1;
    }
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
  const bonusSurgeBalls = state.buffMultiBallTurns > 0 ? 3 : 0;
  if (state.buffMultiBallTurns > 0) {
    state.buffMultiBallTurns -= 1;
  }
  state.ballsToFire = state.ballCount + bonusSurgeBalls;
  state.maxBalls = Math.max(state.maxBalls, state.ballsToFire);
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
  const diffMult = DIFFICULTY_CONFIGS[state.difficultyMode].scoreMult;
  const mult = Math.max(1, state.dailyScoreMultiplier) * diffMult;
  const total = rawPoints * mult + state.scoreRemainder;
  const whole = Math.floor(total);
  state.scoreRemainder = total - whole;
  state.score += whole;
  return whole;
}

function spawnFloatingBuffFromBlock(state: GameState, block: Block): void {
  if (block.kind !== 'powerup') return;
  const cx = block.x + block.width / 2;
  const cy = block.y + block.height / 2;
  const buffType: BuffType =
    block.powerupReward ??
    (Math.random() < (state.shields === 0 ? 0.58 : 0.45)
      ? 'shield_expansion'
      : 'multi_ball');

  const driftTowardCenter = (LOGICAL_WIDTH / 2 - cx) * 0.18;
  const buff: FloatingBuff = {
    id: state.nextEntityId++,
    type: buffType,
    x: cx,
    y: cy,
    vx: clamp(driftTowardCenter, -36, 36),
    vy: -95,
    radius: 16,
    bobPhase: Math.random() * Math.PI * 2,
    life: 11.0,
    maxLife: 11.0,
    collected: false,
  };
  state.floatingBuffs.push(buff);
  spawnRadialBurst(
    state,
    cx,
    cy,
    buffType === 'multi_ball' ? '#38bdf8' : '#818cf8',
    16,
    46
  );
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
  ball.hitChain += 1;
  if (ball.hitChain >= 2 && ball.hitChain > state.trajectoryCombo) {
    const prevVoiceTier = getComboVoiceTier(state.trajectoryCombo);
    state.trajectoryCombo = ball.hitChain;
    state.trajectoryComboBump += 1;
    const nextVoiceTier = getComboVoiceTier(state.trajectoryCombo);
    if (nextVoiceTier !== 0 && nextVoiceTier > prevVoiceTier) {
      soundEngine.playComboVoice(nextVoiceTier);
    }
  }
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
    spawnFloatingBuffFromBlock(state, block);

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
  deltaRad: number,
  targetSpeed = BALL_SPEED
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
    vx: (rvx / mag) * targetSpeed,
    vy: (rvy / mag) * targetSpeed,
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
    const ballSpeed = getCurrentBallSpeed(state);
    let activeTotal = state.balls.filter((b) => b.active && !b.recalling).length;

    for (let i = 0; i < baseCount; i++) {
      const src = state.balls[i];
      if (!src.active || src.recalling) continue;
      if (activeTotal + 2 > MAX_ACTIVE_BALLS) break;

      const left = rotateVelocity(src.vx, src.vy, -spread, ballSpeed);
      const right = rotateVelocity(src.vx, src.vy, spread, ballSpeed);

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
          hitChain: src.hitChain,
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
          spawnFloatingBuffFromBlock(state, block);
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
      ball.hitChain += 1;
      if (ball.hitChain >= 2 && ball.hitChain > state.trajectoryCombo) {
        const prevVoiceTier = getComboVoiceTier(state.trajectoryCombo);
        state.trajectoryCombo = ball.hitChain;
        state.trajectoryComboBump += 1;
        const nextVoiceTier = getComboVoiceTier(state.trajectoryCombo);
        if (nextVoiceTier !== 0 && nextVoiceTier > prevVoiceTier) {
          soundEngine.playComboVoice(nextVoiceTier);
        }
      }
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
      spawnFloatingBuffFromBlock(state, block);
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

function collectFloatingBuff(
  state: GameState,
  buff: FloatingBuff
): void {
  buff.collected = true;
  state.powerupsCollected += 1;

  if (buff.type === 'multi_ball') {
    // Immediate 3-way split on up to 6 active balls + temporary +3 salvo surge for 2 turns
    const spread = (20 * Math.PI) / 180;
    const baseCount = state.balls.length;
    const ballSpeed = getCurrentBallSpeed(state);
    let activeTotal = state.balls.filter((b) => b.active && !b.recalling).length;
    let splitSources = 0;

    for (let i = 0; i < baseCount && splitSources < 6; i++) {
      const src = state.balls[i];
      if (!src.active || src.recalling) continue;
      if (activeTotal + 2 > MAX_ACTIVE_BALLS) break;

      const left = rotateVelocity(src.vx, src.vy, -spread, ballSpeed);
      const right = rotateVelocity(src.vx, src.vy, spread, ballSpeed);
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
          hitChain: src.hitChain,
          trail: [],
        });
      }
      activeTotal += 2;
      splitSources += 1;
    }

    state.buffMultiBallTurns = Math.min(5, state.buffMultiBallTurns + 2);
    state.maxBalls = Math.max(state.maxBalls, activeTotal);
    state.shieldNoticeText = `MULTI-BALL BUFF · +3 SALVO (${state.buffMultiBallTurns}T)`;
    state.shieldNoticeTimer = 2.0;
    spawnRadialBurst(state, buff.x, buff.y, '#38bdf8', 22, 62);
    soundEngine.playMultiBall();
    hapticsEngine.pickup('multi_ball');
    return;
  }

  // Shield Expansion: temporarily expands max shields to 3, adds +1 shield, and widens Aegis barrier for 3 turns
  state.buffShieldExpandTurns = Math.min(6, state.buffShieldExpandTurns + 3);
  state.shields = Math.min(MAX_SHIELDS + 1, state.shields + 1);
  state.shieldFlashTimer = 0.75;
  state.shieldNoticeText = `SHIELD EXPANSION · WIDE BARRIER (${state.buffShieldExpandTurns}T)`;
  state.shieldNoticeTimer = 2.1;
  spawnRadialBurst(state, buff.x, buff.y, '#818cf8', 24, 66);
  soundEngine.playShieldGain();
  hapticsEngine.pickup('shield');
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
  const ballSpeed = getCurrentBallSpeed(state);
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
      ball.vx = (ball.vx / mag) * ballSpeed;
      ball.vy = (ball.vy / mag) * ballSpeed;
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

  // Floating buff icons spawned by destroyed Power-up bricks
  for (const buff of state.floatingBuffs) {
    if (buff.collected) continue;
    const dx = ball.x - buff.x;
    const dy = ball.y - buff.y;
    const hitDist = ball.radius + buff.radius + 5;
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      collectFloatingBuff(state, buff);
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
          ball.vx = (ball.vx / mag) * ballSpeed;
          ball.vy = (ball.vy / mag) * ballSpeed;
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
          ball.vx = (ball.vx / mag) * ballSpeed;
          ball.vy = (ball.vy / mag) * ballSpeed;
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
  state.trajectoryCombo = 0;
  if (state.turnPeakMultiplier >= 2) {
    state.multiplierHudResetting = true;
  }
  state.turn += 1;

  const nextStage = getDifficultyTier(state.turn, state.difficultyMode);
  const stageMeta = getStageMetadata(nextStage);
  state.stageSpeedMult = stageMeta.speedMult;

  if (nextStage > state.difficultyTier) {
    state.difficultyTier = nextStage;
    state.tierBannerText = `STAGE ${nextStage} · ${stageMeta.title.toUpperCase()} (${stageMeta.speedMult.toFixed(2)}× SPD)`;
    state.tierBannerTimer = 2.6;
    state.shockwaves.push({
      x: LOGICAL_WIDTH / 2,
      y: TOP_OFFSET + CELL_SIZE / 2,
      radius: 16,
      maxRadius: LOGICAL_WIDTH * 0.55,
      color: '#fbbf24',
      life: 0.45,
      maxLife: 0.45,
    });
    soundEngine.playStageUp(nextStage);
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

  // Floating buff icon animation (bobbing in AIMING, drifting & aging during active play)
  for (let i = state.floatingBuffs.length - 1; i >= 0; i--) {
    const buff = state.floatingBuffs[i];
    if (buff.collected) {
      state.floatingBuffs.splice(i, 1);
      continue;
    }
    buff.bobPhase += dt * 4.2;
    if (state.phase === 'FIRING' || state.phase === 'FLYING' || state.phase === 'SHIFTING') {
      buff.life -= dt;
      if (buff.life <= 0) {
        state.floatingBuffs.splice(i, 1);
        continue;
      }
      // Gravity pulls initial upward pop down into a gentle float above the floor line
      buff.vy = Math.min(54, buff.vy + 220 * dt);
      buff.x += buff.vx * dt;
      buff.y += buff.vy * dt;
      buff.vx *= Math.exp(-1.5 * dt);

      if (buff.x < buff.radius + 12) {
        buff.x = buff.radius + 12;
        buff.vx = Math.abs(buff.vx) * 0.7;
      } else if (buff.x > LOGICAL_WIDTH - buff.radius - 12) {
        buff.x = LOGICAL_WIDTH - buff.radius - 12;
        buff.vx = -Math.abs(buff.vx) * 0.7;
      }

      const maxFloatY = FLOOR_Y - 34;
      if (buff.y > maxFloatY) {
        buff.y = maxFloatY;
        buff.vy = 0;
      }
    }
  }

  if (state.phase === 'AIMING' || state.phase === 'GAME_OVER') {
    return false;
  }

  const stageMeta = getStageMetadata(state.difficultyTier);
  const ballSpeed = getCurrentBallSpeed(state);

  if (state.phase === 'SHIFTING') {
    state.shiftTimer = Math.max(0, state.shiftTimer - dt * stageMeta.shiftSpeedMult);
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

      const isShieldExpanded = state.buffShieldExpandTurns > 0;

      // Expanded Shield Energy Field zaps bricks entering the row right above DANGER_ROW
      if (isShieldExpanded && state.shields > 0) {
        for (const block of state.blocks) {
          if (block.hp <= 0 || block.row !== DANGER_ROW - 1) continue;
          const dmg = Math.min(block.hp, 2);
          block.hp -= dmg;
          block.flashTimer = 0.14;
          addScaledScore(state, dmg);
          if (block.hp <= 0) {
            state.blocksDestroyed += 1;
            addScaledScore(state, 5);
            spawnBlockDestructionBurst(state, block, '#818cf8', 0, -140, 1.15);
            spawnFloatingBuffFromBlock(state, block);
          }
        }
        for (let i = state.blocks.length - 1; i >= 0; i--) {
          if (state.blocks[i].hp <= 0) {
            state.blocks.splice(i, 1);
          }
        }
      }

      const breachThresholdRow =
        isShieldExpanded && state.shields > 0 ? DANGER_ROW - 1 : DANGER_ROW;
      const hasHardBreach = state.blocks.some((b) => b.row >= DANGER_ROW);
      const breachingBlocks = hasHardBreach
        ? state.blocks.filter((b) => b.row >= breachThresholdRow)
        : [];

      if (hasHardBreach) {
        if (state.shields > 0) {
          state.shields -= 1;
          state.shieldSavesThisRun += 1;
          state.shieldFlashTimer = 0.85;
          state.shieldNoticeText = isShieldExpanded
            ? 'EXPANDED SHIELD · 2 ROWS CLEARED'
            : state.shields > 0
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
            spawnFloatingBuffFromBlock(state, block);
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

      if (state.buffShieldExpandTurns > 0) {
        state.buffShieldExpandTurns -= 1;
        if (state.buffShieldExpandTurns === 0 && state.shields > MAX_SHIELDS) {
          state.shields = MAX_SHIELDS;
        }
      }

      snapshotChanged = true;
    }
    return snapshotChanged;
  }

  // FIRING or FLYING phase
  const speedMult = state.fastForward ? 2 : 1;
  const simDt = dt * speedMult;
  const effectiveFireInterval = FIRE_INTERVAL / stageMeta.fireCadenceMult;

  if (state.phase === 'FIRING' && !state.recallActive) {
    state.fireCooldown -= simDt;
    while (state.fireCooldown <= 0 && state.ballsToFire > 0) {
      state.balls.push({
        id: state.nextEntityId++,
        x: state.launchX,
        y: FLOOR_Y - BALL_RADIUS,
        vx: Math.cos(state.launchAngleRad) * ballSpeed,
        vy: -Math.sin(state.launchAngleRad) * ballSpeed,
        radius: BALL_RADIUS,
        active: true,
        recalling: false,
        recallStartX: 0,
        recallStartY: 0,
        recallProgress: 0,
        bouncesSinceBlock: 0,
        destroyChain: 0,
        hitChain: 0,
        trail: [],
      });

      if (state.ballsToFire === state.ballCount || state.ballsToFire % 4 === 0) {
        soundEngine.playLaunch();
      }
      state.ballsToFire -= 1;
      state.fireCooldown += effectiveFireInterval;
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
  const frameDist = ballSpeed * simDt;
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
    const prevShields = state.shields;
    const prevTrajectoryCombo = state.trajectoryCombo;
    for (let s = 0; s < subSteps; s++) {
      if (!ball.active) break;
      stepBallSubstep(state, ball, subDt);
    }

    if (
      state.score !== prevScore ||
      state.pendingExtraBalls !== prevExtra ||
      state.shields !== prevShields ||
      state.trajectoryCombo !== prevTrajectoryCombo
    ) {
      snapshotChanged = true;
    }

    if (ball.active) {
      recordBallTrail(ball, ballSpeed * speedMult);
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
    difficultyMode?: DifficultyMode;
    difficultyTier: number;
    shields?: number;
    shieldSavesThisRun?: number;
    buffMultiBallTurns?: number;
    buffShieldExpandTurns?: number;
    dailyRewardBonus?: DailyRewardChoice | null;
    nextEntityId: number;
    blocks: GameState['blocks'];
    pickups: GameState['pickups'];
  },
  dailyScoreMultiplier = 1
): GameState {
  const bestScore = Math.max(loadBestScore(), snapshot.bestScore || 0);
  const mode: DifficultyMode =
    snapshot.difficultyMode === 'relaxed' ||
    snapshot.difficultyMode === 'overdrive' ||
    snapshot.difficultyMode === 'standard'
      ? snapshot.difficultyMode
      : 'standard';
  const cfg = DIFFICULTY_CONFIGS[mode];
  const resolvedStage = Math.max(
    getDifficultyTier(snapshot.turn, mode),
    snapshot.difficultyTier || 1
  );
  const stageMeta = getStageMetadata(resolvedStage);
  const buffShieldExpandTurns = snapshot.buffShieldExpandTurns ?? 0;
  const dailyRewardBonus: DailyRewardChoice | null =
    snapshot.dailyRewardBonus === 'multiplier_boost' ||
    snapshot.dailyRewardBonus === 'starter_shield'
      ? snapshot.dailyRewardBonus
      : null;
  const maxShieldCap =
    buffShieldExpandTurns > 0 || dailyRewardBonus === 'starter_shield'
      ? MAX_SHIELDS + 1
      : MAX_SHIELDS;
  const rewardMultBonus =
    dailyRewardBonus === 'multiplier_boost' ? DAILY_REWARD_MULTIPLIER_BOOST : 0;
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
    trajectoryCombo: 0,
    trajectoryComboBump: 0,
    turnPeakMultiplier: 0,
    turnPeakMultiplierTimer: 0,
    multiplierHudAlpha: 0,
    multiplierHudBump: 0,
    multiplierHudPhase: 0,
    multiplierHudResetting: false,
    peakChainThisRun: snapshot.peakChainThisRun,
    blocksDestroyed: snapshot.blocksDestroyed,
    bombsDetonated: snapshot.bombsDetonated,
    dailyScoreMultiplier:
      Math.round((Math.max(1, dailyScoreMultiplier) + rewardMultBonus) * 100) / 100,
    dailyRewardBonus,
    scoreRemainder: snapshot.scoreRemainder,
    isNewBest: snapshot.score > 0 && snapshot.score >= bestScore,
    hasTakenFirstShot: true,
    difficultyMode: mode,
    difficultyTier: resolvedStage,
    stageSpeedMult: stageMeta.speedMult,
    tierBannerText: null,
    tierBannerTimer: 0,
    shields:
      typeof snapshot.shields === 'number'
        ? clamp(snapshot.shields, 0, maxShieldCap)
        : cfg.startingShields,
    shieldSavesThisRun: snapshot.shieldSavesThisRun ?? 0,
    shieldFlashTimer: 0,
    shieldNoticeText: null,
    shieldNoticeTimer: 0,
    buffMultiBallTurns: snapshot.buffMultiBallTurns ?? 0,
    buffShieldExpandTurns,
    nextEntityId: snapshot.nextEntityId,
    blocks: snapshot.blocks.map((b) => ({ ...b, flashTimer: 0, hitScale: 0 })),
    pickups: snapshot.pickups.map((p) => ({ ...p })),
    floatingBuffs: [],
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
