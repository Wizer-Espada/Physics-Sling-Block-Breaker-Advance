export type GamePhase = 'AIMING' | 'FIRING' | 'FLYING' | 'SHIFTING' | 'GAME_OVER';

export type BlockShape = 'rect' | 'circle';
export type PickupType = 'extra_ball' | 'multi_ball' | 'bomb' | 'shield';

export interface Block {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  shape: BlockShape;
  armored?: boolean;
  flashTimer: number;
  hitScale: number;
}

export interface Pickup {
  id: number;
  type: PickupType;
  col: number;
  row: number;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  pulsePhase: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  active: boolean;
  recalling: boolean;
  recallStartX: number;
  recallStartY: number;
  recallProgress: number;
  bouncesSinceBlock: number;
  destroyChain: number;
  trail: Array<{ x: number; y: number }>;
}

export type ParticleKind = 'spark' | 'shard';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  rotation: number;
  vRot: number;
  sides: number;
  stretch: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface MultiplierPopup {
  x: number;
  y: number;
  vy: number;
  multiplier: number;
  bonusPoints: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface AimState {
  isDragging: boolean;
  isValid: boolean;
  angleRad: number;
  pullDistance: number;
  previewPoints: Array<{ x: number; y: number }>;
}

export interface GameState {
  phase: GamePhase;
  score: number;
  bestScore: number;
  turn: number;
  ballCount: number;
  pendingExtraBalls: number;
  powerupsCollected: number;
  maxBalls: number;
  launchX: number;
  nextLaunchX: number | null;
  launchAngleRad: number;
  ballsToFire: number;
  fireCooldown: number;
  fastForward: boolean;
  recallActive: boolean;
  shiftTimer: number;
  shakeTrauma: number;
  shakeKickX: number;
  shakeKickY: number;
  combo: number;
  turnPeakMultiplier: number;
  turnPeakMultiplierTimer: number;
  multiplierHudAlpha: number;
  multiplierHudBump: number;
  multiplierHudPhase: number;
  multiplierHudResetting: boolean;
  peakChainThisRun: number;
  blocksDestroyed: number;
  bombsDetonated: number;
  dailyScoreMultiplier: number;
  scoreRemainder: number;
  isNewBest: boolean;
  hasTakenFirstShot: boolean;
  difficultyTier: number;
  tierBannerText: string | null;
  tierBannerTimer: number;
  shields: number;
  shieldFlashTimer: number;
  shieldNoticeText: string | null;
  shieldNoticeTimer: number;
  nextEntityId: number;
  blocks: Block[];
  pickups: Pickup[];
  balls: Ball[];
  particles: Particle[];
  shockwaves: Shockwave[];
  multiplierPopups: MultiplierPopup[];
  aim: AimState;
}

export const LOGICAL_WIDTH = 420;
export const LOGICAL_HEIGHT = 660;
export const COLS = 7;
export const PADDING_X = 12;
export const TOP_OFFSET = 44;
export const CELL_GAP = 6;
export const CELL_SIZE = (LOGICAL_WIDTH - PADDING_X * 2 - CELL_GAP * (COLS - 1)) / COLS;
export const ROW_STEP = CELL_SIZE + CELL_GAP;
export const DANGER_ROW = 9;
export const DANGER_Y = TOP_OFFSET + DANGER_ROW * ROW_STEP - CELL_GAP / 2;
export const FLOOR_Y = LOGICAL_HEIGHT - 30;
export const BALL_RADIUS = 6.5;
export const BALL_SPEED = 1480;
export const FIRE_INTERVAL = 0.06;
export const SHIFT_DURATION = 0.22;
export const RECALL_DURATION = 0.18;
export const MIN_ANGLE_RAD = (15 * Math.PI) / 180;
export const MAX_ANGLE_RAD = (165 * Math.PI) / 180;
export const MAX_SHIELDS = 2;
export const BEST_SCORE_KEY = 'prism_sling_2d_best_score';
