import { DailyMissionsState, getTodayDateKey } from './missions.ts';
import { Block, DailyRewardChoice, DifficultyMode, GameState, Pickup } from './types.ts';

export interface SavedRunRecord {
  id: string;
  score: number;
  turn: number;
  maxBalls: number;
  powerupsCollected: number;
  blocksDestroyed: number;
  peakChain: number;
  dailyMultiplier: number;
  difficultyMode?: DifficultyMode;
  playedAt: string;
}

export interface DailyActivityRecord {
  played: boolean;
  missionsCompleted: number;
  runsCount: number;
}

export interface SevenDayActivityDay {
  dateKey: string;
  weekdayLabel: string;
  shortDateLabel: string;
  isToday: boolean;
  played: boolean;
  missionsCompleted: number;
  missionsTarget: number;
  runsCount: number;
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
  dailyHistory: Record<string, DailyActivityRecord>;
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
  difficultyMode?: DifficultyMode;
  difficultyTier: number;
  shields?: number;
  shieldSavesThisRun?: number;
  buffMultiBallTurns?: number;
  buffShieldExpandTurns?: number;
  dailyRewardBonus?: DailyRewardChoice | null;
  nextEntityId: number;
  blocks: Block[];
  pickups: Pickup[];
}

const PROGRESS_STORAGE_KEY = 'prism_sling_player_progress_v1';
const ACTIVE_RUN_STORAGE_KEY = 'prism_sling_active_run_v1';
const MAX_SAVED_RUNS = 25;
const MAX_HISTORY_DAYS = 30;

export function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return '';
  const prev = new Date(y, m - 1, d - 1);
  return getTodayDateKey(prev);
}

function pruneDailyHistory(
  history: Record<string, DailyActivityRecord>
): Record<string, DailyActivityRecord> {
  const keys = Object.keys(history).sort().reverse().slice(0, MAX_HISTORY_DAYS);
  const pruned: Record<string, DailyActivityRecord> = {};
  for (const key of keys) {
    const rec = history[key];
    if (rec && typeof rec === 'object') {
      pruned[key] = {
        played: Boolean(rec.played),
        missionsCompleted: Math.max(0, Math.floor(rec.missionsCompleted || 0)),
        runsCount: Math.max(0, Math.floor(rec.runsCount || 0)),
      };
    }
  }
  return pruned;
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
    dailyHistory: {},
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
      dailyHistory:
        parsed.dailyHistory && typeof parsed.dailyHistory === 'object'
          ? pruneDailyHistory(parsed.dailyHistory)
          : {},
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
  const existingEntry = prev.dailyHistory[todayKey];
  const alreadyRecordedDay = prev.lastPlayedDateKey === todayKey;

  if (alreadyRecordedDay && existingEntry?.played) {
    return { next: prev, changed: false };
  }

  const yesterdayKey = getPreviousDateKey(todayKey);
  const nextStreak = alreadyRecordedDay
    ? prev.currentPlayStreak
    : prev.lastPlayedDateKey === yesterdayKey
      ? prev.currentPlayStreak + 1
      : 1;

  const nextHistory = pruneDailyHistory({
    ...prev.dailyHistory,
    [todayKey]: {
      played: true,
      missionsCompleted: existingEntry?.missionsCompleted ?? 0,
      runsCount: existingEntry?.runsCount ?? 0,
    },
  });

  const next: PlayerProgressState = {
    ...prev,
    currentPlayStreak: nextStreak,
    bestPlayStreak: Math.max(prev.bestPlayStreak, nextStreak),
    lastPlayedDateKey: todayKey,
    dailyHistory: nextHistory,
  };
  savePlayerProgress(next);
  return { next, changed: true };
}

export function recordMissionCompletionDay(
  prev: PlayerProgressState,
  now = new Date()
): { next: PlayerProgressState; changed: boolean } {
  const todayKey = getTodayDateKey(now);
  const existingEntry = prev.dailyHistory[todayKey];
  const alreadyRecordedDay = prev.lastMissionCompletedDateKey === todayKey;

  if (
    alreadyRecordedDay &&
    existingEntry &&
    existingEntry.missionsCompleted >= 1 &&
    existingEntry.played
  ) {
    return { next: prev, changed: false };
  }

  const yesterdayKey = getPreviousDateKey(todayKey);
  const nextStreak = alreadyRecordedDay
    ? prev.currentMissionStreak
    : prev.lastMissionCompletedDateKey === yesterdayKey
      ? prev.currentMissionStreak + 1
      : 1;

  const nextHistory = pruneDailyHistory({
    ...prev.dailyHistory,
    [todayKey]: {
      played: true,
      missionsCompleted: Math.max(existingEntry?.missionsCompleted ?? 0, 1),
      runsCount: existingEntry?.runsCount ?? 0,
    },
  });

  const next: PlayerProgressState = {
    ...prev,
    currentMissionStreak: nextStreak,
    bestMissionStreak: Math.max(prev.bestMissionStreak, nextStreak),
    lastMissionCompletedDateKey: todayKey,
    dailyHistory: nextHistory,
  };
  savePlayerProgress(next);
  return { next, changed: true };
}

export function recordDailyMissionsHistory(
  prev: PlayerProgressState,
  dailyState: DailyMissionsState
): { next: PlayerProgressState; changed: boolean } {
  const completedCount = dailyState.missions.filter((m) => m.completed).length;
  const existing = prev.dailyHistory[dailyState.dateKey];
  const nextPlayed = Boolean(existing?.played) || completedCount > 0;

  if (
    existing &&
    existing.missionsCompleted === completedCount &&
    existing.played === nextPlayed
  ) {
    return { next: prev, changed: false };
  }

  const next: PlayerProgressState = {
    ...prev,
    dailyHistory: pruneDailyHistory({
      ...prev.dailyHistory,
      [dailyState.dateKey]: {
        played: nextPlayed,
        missionsCompleted: completedCount,
        runsCount: existing?.runsCount ?? 0,
      },
    }),
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
    difficultyMode?: DifficultyMode;
  },
  now = new Date()
): PlayerProgressState {
  const { next: withDay } = recordPlayDay(prev, now);
  const todayKey = getTodayDateKey(now);
  const existingEntry = withDay.dailyHistory[todayKey];

  const entry: SavedRunRecord = {
    id: `local-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    score: Math.max(0, Math.floor(run.score)),
    turn: Math.max(1, Math.floor(run.turn)),
    maxBalls: Math.max(1, Math.floor(run.maxBalls)),
    powerupsCollected: Math.max(0, Math.floor(run.powerupsCollected)),
    blocksDestroyed: Math.max(0, Math.floor(run.blocksDestroyed)),
    peakChain: Math.max(0, Math.floor(run.peakChain)),
    dailyMultiplier: run.dailyMultiplier,
    difficultyMode: run.difficultyMode,
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
    dailyHistory: pruneDailyHistory({
      ...withDay.dailyHistory,
      [todayKey]: {
        played: true,
        missionsCompleted: existingEntry?.missionsCompleted ?? 0,
        runsCount: (existingEntry?.runsCount ?? 0) + 1,
      },
    }),
  };

  savePlayerProgress(next);
  return next;
}

export function getSevenDayMissionHistory(
  progress: PlayerProgressState,
  dailyState?: DailyMissionsState,
  now = new Date()
): SevenDayActivityDay[] {
  const todayKey = getTodayDateKey(now);

  // Backfill play days & mission streak days for accounts with prior runs before dailyHistory existed
  const streakPlayedKeys = new Set<string>();
  if (progress.lastPlayedDateKey && progress.currentPlayStreak > 0) {
    let cursor = progress.lastPlayedDateKey;
    const cap = Math.min(progress.currentPlayStreak, 14);
    for (let i = 0; i < cap && cursor; i++) {
      streakPlayedKeys.add(cursor);
      cursor = getPreviousDateKey(cursor);
    }
  }

  const streakMissionKeys = new Set<string>();
  if (progress.lastMissionCompletedDateKey && progress.currentMissionStreak > 0) {
    let cursor = progress.lastMissionCompletedDateKey;
    const cap = Math.min(progress.currentMissionStreak, 14);
    for (let i = 0; i < cap && cursor; i++) {
      streakMissionKeys.add(cursor);
      cursor = getPreviousDateKey(cursor);
    }
  }

  const runsPerDay = new Map<string, number>();
  for (const run of progress.recentRuns) {
    const dt = new Date(run.playedAt);
    if (!Number.isNaN(dt.getTime())) {
      const k = getTodayDateKey(dt);
      runsPerDay.set(k, (runsPerDay.get(k) ?? 0) + 1);
    }
  }

  const days: SevenDayActivityDay[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const dateKey = getTodayDateKey(date);
    const stored = progress.dailyHistory[dateKey];
    const runCountFromRecent = runsPerDay.get(dateKey) ?? 0;

    let missionsCompleted = stored?.missionsCompleted ?? 0;
    if (missionsCompleted === 0 && streakMissionKeys.has(dateKey)) {
      missionsCompleted = 1;
    }

    let missionsTarget = 3;
    if (dailyState && dailyState.dateKey === dateKey) {
      missionsTarget = Math.max(1, dailyState.missions.length);
      missionsCompleted = dailyState.missions.filter((m) => m.completed).length;
    }

    const runsCount = Math.max(stored?.runsCount ?? 0, runCountFromRecent);
    const played =
      Boolean(stored?.played) ||
      runsCount > 0 ||
      missionsCompleted > 0 ||
      streakPlayedKeys.has(dateKey);

    days.push({
      dateKey,
      weekdayLabel:
        dateKey === todayKey
          ? 'Today'
          : date.toLocaleDateString(undefined, { weekday: 'short' }),
      shortDateLabel: date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      isToday: dateKey === todayKey,
      played,
      missionsCompleted: Math.min(missionsTarget, Math.max(0, missionsCompleted)),
      missionsTarget,
      runsCount,
    });
  }

  return days;
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
      difficultyMode: state.difficultyMode,
      difficultyTier: state.difficultyTier,
      shields: state.shields,
      shieldSavesThisRun: state.shieldSavesThisRun,
      buffMultiBallTurns: state.buffMultiBallTurns,
      buffShieldExpandTurns: state.buffShieldExpandTurns,
      dailyRewardBonus: state.dailyRewardBonus,
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
