import { getTodayDateKey } from './missions.ts';
import { Block, GameState, Pickup } from './types.ts';

export interface SavedRunRecord {
  id: string;
  score: number;
  turn: number;
  maxBalls: number;
  powerupsCollected: number;
  blocksDestroyed: number;
  peakChain: number;
  dailyMultiplier: number;
  playedAt: string;
}

export interface PlayerProgressState {
  currentPlayStreak: number;
  bestPlayStreak: number;
  lastPlayedDateKey: string | null;
  currentMissionStreak: number;
  bestMissionStreak: number;
  lastMissionCompletedDateKey: string | null;
  totalRuns: number;
  totalBlocksDestroyed: number;
  totalScoreEarned: number;
  highestTurn: number;
  highestChain: number;
  bestScore: number;
  recentRuns: SavedRunRecord[];
}

export interface SavedActiveRun {
  version: 1;
  savedAt: string;
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
  blocks: Block[];
  pickups: Pickup[];
}

const PROGRESS_STORAGE_KEY = 'prism_sling_player_progress_v1';
const ACTIVE_RUN_STORAGE_KEY = 'prism_sling_active_run_v1';
const MAX_SAVED_RUNS = 25;

export function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return '';
  const prev = new Date(y, m - 1, d - 1);
  return getTodayDateKey(prev);
}

function createEmptyProgress(): PlayerProgressState {
  return {
    currentPlayStreak: 0,
    bestPlayStreak: 0,
    lastPlayedDateKey: null,
    currentMissionStreak: 0,
    bestMissionStreak: 0,
    lastMissionCompletedDateKey: null,
    totalRuns: 0,
    totalBlocksDestroyed: 0,
    totalScoreEarned: 0,
    highestTurn: 0,
    highestChain: 0,
    bestScore: 0,
    recentRuns: [],
  };
}

export function loadPlayerProgress(): PlayerProgressState {
  const fallback = createEmptyProgress();
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PlayerProgressState>;
    if (!parsed || typeof parsed !== 'object') return fallback;
    return {
      ...fallback,
      ...parsed,
      recentRuns: Array.isArray(parsed.recentRuns) ? parsed.recentRuns : [],
    };
  } catch {
    return fallback;
  }
}

export function savePlayerProgress(progress: PlayerProgressState): void {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage errors
  }
}

export function getEffectivePlayStreak(
  progress: PlayerProgressState,
  todayKey = getTodayDateKey()
): number {
  if (!progress.lastPlayedDateKey) return 0;
  const yesterdayKey = getPreviousDateKey(todayKey);
  if (
    progress.lastPlayedDateKey === todayKey ||
    progress.lastPlayedDateKey === yesterdayKey
  ) {
    return progress.currentPlayStreak;
  }
  return 0;
}

export function getEffectiveMissionStreak(
  progress: PlayerProgressState,
  todayKey = getTodayDateKey()
): number {
  if (!progress.lastMissionCompletedDateKey) return 0;
  const yesterdayKey = getPreviousDateKey(todayKey);
  if (
    progress.lastMissionCompletedDateKey === todayKey ||
    progress.lastMissionCompletedDateKey === yesterdayKey
  ) {
    return progress.currentMissionStreak;
  }
  return 0;
}

export function recordPlayDay(
  prev: PlayerProgressState,
  now = new Date()
): { next: PlayerProgressState; changed: boolean } {
  const todayKey = getTodayDateKey(now);
  if (prev.lastPlayedDateKey === todayKey) {
    return { next: prev, changed: false };
  }

  const yesterdayKey = getPreviousDateKey(todayKey);
  const nextStreak =
    prev.lastPlayedDateKey === yesterdayKey ? prev.currentPlayStreak + 1 : 1;
  const next: PlayerProgressState = {
    ...prev,
    currentPlayStreak: nextStreak,
    bestPlayStreak: Math.max(prev.bestPlayStreak, nextStreak),
    lastPlayedDateKey: todayKey,
  };
  savePlayerProgress(next);
  return { next, changed: true };
}

export function recordMissionCompletionDay(
  prev: PlayerProgressState,
  now = new Date()
): { next: PlayerProgressState; changed: boolean } {
  const todayKey = getTodayDateKey(now);
  if (prev.lastMissionCompletedDateKey === todayKey) {
    return { next: prev, changed: false };
  }

  const yesterdayKey = getPreviousDateKey(todayKey);
  const nextStreak =
    prev.lastMissionCompletedDateKey === yesterdayKey
      ? prev.currentMissionStreak + 1
      : 1;
  const next: PlayerProgressState = {
    ...prev,
    currentMissionStreak: nextStreak,
    bestMissionStreak: Math.max(prev.bestMissionStreak, nextStreak),
    lastMissionCompletedDateKey: todayKey,
  };
  savePlayerProgress(next);
  return { next, changed: true };
}

export function recordCompletedRun(
  prev: PlayerProgressState,
  run: {
    score: number;
    turn: number;
    maxBalls: number;
    powerupsCollected: number;
    blocksDestroyed: number;
    peakChain: number;
    dailyMultiplier: number;
  },
  now = new Date()
): PlayerProgressState {
  const { next: withDay } = recordPlayDay(prev, now);

  const entry: SavedRunRecord = {
    id: `local-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    score: Math.max(0, Math.floor(run.score)),
    turn: Math.max(1, Math.floor(run.turn)),
    maxBalls: Math.max(1, Math.floor(run.maxBalls)),
    powerupsCollected: Math.max(0, Math.floor(run.powerupsCollected)),
    blocksDestroyed: Math.max(0, Math.floor(run.blocksDestroyed)),
    peakChain: Math.max(0, Math.floor(run.peakChain)),
    dailyMultiplier: run.dailyMultiplier,
    playedAt: now.toISOString(),
  };

  const next: PlayerProgressState = {
    ...withDay,
    totalRuns: withDay.totalRuns + 1,
    totalBlocksDestroyed: withDay.totalBlocksDestroyed + entry.blocksDestroyed,
    totalScoreEarned: withDay.totalScoreEarned + entry.score,
    highestTurn: Math.max(withDay.highestTurn, entry.turn),
    highestChain: Math.max(withDay.highestChain, entry.peakChain),
    bestScore: Math.max(withDay.bestScore, entry.score),
    recentRuns: [entry, ...withDay.recentRuns].slice(0, MAX_SAVED_RUNS),
  };

  savePlayerProgress(next);
  return next;
}

export function saveActiveRunSnapshot(state: GameState): void {
  if (state.phase !== 'AIMING' || !state.hasTakenFirstShot) return;
  try {
    const snapshot: SavedActiveRun = {
      version: 1,
      savedAt: new Date().toISOString(),
      score: state.score,
      bestScore: state.bestScore,
      turn: state.turn,
      ballCount: state.ballCount,
      launchX: state.launchX,
      powerupsCollected: state.powerupsCollected,
      maxBalls: state.maxBalls,
      peakChainThisRun: state.peakChainThisRun,
      blocksDestroyed: state.blocksDestroyed,
      bombsDetonated: state.bombsDetonated,
      scoreRemainder: state.scoreRemainder,
      difficultyTier: state.difficultyTier,
      shields: state.shields,
      nextEntityId: state.nextEntityId,
      blocks: state.blocks.map((b) => ({ ...b, flashTimer: 0, hitScale: 0 })),
      pickups: state.pickups.map((p) => ({ ...p })),
    };
    localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors
  }
}

export function loadActiveRunSnapshot(): SavedActiveRun | null {
  try {
    const raw = localStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedActiveRun;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.blocks) ||
      !Array.isArray(parsed.pickups) ||
      typeof parsed.turn !== 'number' ||
      parsed.turn < 1
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveRunSnapshot(): void {
  try {
    localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
