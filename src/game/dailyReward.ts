import { getTodayDateKey } from './missions.ts';
import { DailyRewardChoice } from './types.ts';

export const DAILY_REWARD_MULTIPLIER_BOOST = 0.15;
export const DAILY_REWARD_SHIELD_COUNT = 1;

export interface DailyRewardState {
  dateKey: string;
  selectedReward: DailyRewardChoice;
  claimed: boolean;
  consumed: boolean;
  claimedAt: string | null;
  consumedAt: string | null;
}

const DAILY_REWARD_STORAGE_KEY = 'prism_sling_daily_reward_v1';

function hashDateKey(dateKey: string): number {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDefaultRewardForDate(dateKey: string): DailyRewardChoice {
  return hashDateKey(dateKey) % 2 === 0 ? 'multiplier_boost' : 'starter_shield';
}

function isValidChoice(value: unknown): value is DailyRewardChoice {
  return value === 'multiplier_boost' || value === 'starter_shield';
}

export function saveDailyReward(state: DailyRewardState): void {
  try {
    localStorage.setItem(DAILY_REWARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function loadDailyReward(now = new Date()): DailyRewardState {
  const todayKey = getTodayDateKey(now);
  try {
    const raw = localStorage.getItem(DAILY_REWARD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyRewardState>;
      if (parsed && parsed.dateKey === todayKey) {
        return {
          dateKey: todayKey,
          selectedReward: isValidChoice(parsed.selectedReward)
            ? parsed.selectedReward
            : getDefaultRewardForDate(todayKey),
          claimed: Boolean(parsed.claimed),
          consumed: Boolean(parsed.consumed),
          claimedAt: typeof parsed.claimedAt === 'string' ? parsed.claimedAt : null,
          consumedAt: typeof parsed.consumedAt === 'string' ? parsed.consumedAt : null,
        };
      }
    }
  } catch {
    // Fall back to fresh reward for today
  }

  const fresh: DailyRewardState = {
    dateKey: todayKey,
    selectedReward: getDefaultRewardForDate(todayKey),
    claimed: false,
    consumed: false,
    claimedAt: null,
    consumedAt: null,
  };
  saveDailyReward(fresh);
  return fresh;
}

export function selectDailyRewardChoice(
  prev: DailyRewardState,
  choice: DailyRewardChoice,
  now = new Date()
): DailyRewardState {
  const todayKey = getTodayDateKey(now);
  const base = prev.dateKey === todayKey ? prev : loadDailyReward(now);
  if (base.consumed || base.selectedReward === choice) {
    return base;
  }
  const next: DailyRewardState = {
    ...base,
    selectedReward: choice,
  };
  saveDailyReward(next);
  return next;
}

export function claimDailyReward(
  prev: DailyRewardState,
  now = new Date()
): DailyRewardState {
  const todayKey = getTodayDateKey(now);
  const base = prev.dateKey === todayKey ? prev : loadDailyReward(now);
  if (base.consumed || base.claimed) {
    return base;
  }
  const next: DailyRewardState = {
    ...base,
    claimed: true,
    claimedAt: now.toISOString(),
  };
  saveDailyReward(next);
  return next;
}

export function consumeDailyRewardForRun(
  prev: DailyRewardState,
  now = new Date()
): { next: DailyRewardState; granted: DailyRewardChoice | null } {
  const todayKey = getTodayDateKey(now);
  const base = prev.dateKey === todayKey ? prev : loadDailyReward(now);
  if (base.consumed) {
    return { next: base, granted: null };
  }

  const isoNow = now.toISOString();
  const next: DailyRewardState = {
    ...base,
    claimed: true,
    consumed: true,
    claimedAt: base.claimedAt ?? isoNow,
    consumedAt: isoNow,
  };
  saveDailyReward(next);
  return { next, granted: next.selectedReward };
}
