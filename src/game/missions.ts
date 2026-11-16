export type MissionMetric =
  | 'blocks_destroyed'
  | 'reach_turn'
  | 'chain_multiplier'
  | 'powerups_collected'
  | 'bombs_detonated'
  | 'max_balls';

export interface MissionDefinition {
  id: string;
  slot: 'volume' | 'progression' | 'skill';
  title: string;
  description: string;
  metric: MissionMetric;
  target: number;
  bonusMultiplier: number; // e.g. 0.25 adds +0.25x to score multiplier
}

export interface DailyMissionProgress {
  id: string;
  slot: 'volume' | 'progression' | 'skill';
  title: string;
  description: string;
  metric: MissionMetric;
  target: number;
  progress: number;
  bonusMultiplier: number;
  completed: boolean;
  completedAt: string | null;
}

export interface DailyMissionsState {
  dateKey: string;
  missions: DailyMissionProgress[];
}

export interface RunMissionMetrics {
  blocksDestroyed: number;
  powerupsCollected: number;
  bombsDetonated: number;
  turn: number;
  maxBalls: number;
  peakChain: number;
}

const DAILY_MISSIONS_STORAGE_KEY = 'prism_sling_daily_missions_v1';

const VOLUME_POOL: MissionDefinition[] = [
  {
    id: 'destroy_50_blocks',
    slot: 'volume',
    title: 'Brick Breaker',
    description: 'Destroy 50 blocks across runs today',
    metric: 'blocks_destroyed',
    target: 50,
    bonusMultiplier: 0.25,
  },
  {
    id: 'destroy_100_blocks',
    slot: 'volume',
    title: 'Prism Crusher',
    description: 'Destroy 100 blocks across runs today',
    metric: 'blocks_destroyed',
    target: 100,
    bonusMultiplier: 0.35,
  },
  {
    id: 'collect_10_powerups',
    slot: 'volume',
    title: 'Orb Collector',
    description: 'Collect 10 power-ups across runs today',
    metric: 'powerups_collected',
    target: 10,
    bonusMultiplier: 0.25,
  },
];

const PROGRESSION_POOL: MissionDefinition[] = [
  {
    id: 'reach_turn_10',
    slot: 'progression',
    title: 'Tier Challenger',
    description: 'Reach Turn 10 in a run',
    metric: 'reach_turn',
    target: 10,
    bonusMultiplier: 0.3,
  },
  {
    id: 'reach_turn_15',
    slot: 'progression',
    title: 'Endurance Wave',
    description: 'Reach Turn 15 in a run',
    metric: 'reach_turn',
    target: 15,
    bonusMultiplier: 0.4,
  },
  {
    id: 'salvo_14_balls',
    slot: 'progression',
    title: 'Full Salvo',
    description: 'Build a salvo of 14 balls in a run',
    metric: 'max_balls',
    target: 14,
    bonusMultiplier: 0.3,
  },
];

const SKILL_POOL: MissionDefinition[] = [
  {
    id: 'chain_x4',
    slot: 'skill',
    title: 'Chain Reaction',
    description: 'Land a ×4 brick chain in one trajectory',
    metric: 'chain_multiplier',
    target: 4,
    bonusMultiplier: 0.25,
  },
  {
    id: 'chain_x6',
    slot: 'skill',
    title: 'Prism Cascade',
    description: 'Land a ×6 brick chain in one trajectory',
    metric: 'chain_multiplier',
    target: 6,
    bonusMultiplier: 0.4,
  },
  {
    id: 'detonate_3_bombs',
    slot: 'skill',
    title: 'Blast Specialist',
    description: 'Detonate 3 Bomb power-ups today',
    metric: 'bombs_detonated',
    target: 3,
    bonusMultiplier: 0.3,
  },
];

export function getTodayDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashDateKey(dateKey: string): number {
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function generateMissionsForDate(dateKey: string): DailyMissionProgress[] {
  const seed = hashDateKey(dateKey);
  const picks: MissionDefinition[] = [
    VOLUME_POOL[seed % VOLUME_POOL.length],
    PROGRESSION_POOL[(seed >>> 4) % PROGRESSION_POOL.length],
    SKILL_POOL[(seed >>> 8) % SKILL_POOL.length],
  ];

  return picks.map((def) => ({
    id: def.id,
    slot: def.slot,
    title: def.title,
    description: def.description,
    metric: def.metric,
    target: def.target,
    progress: 0,
    bonusMultiplier: def.bonusMultiplier,
    completed: false,
    completedAt: null,
  }));
}

export function loadDailyMissions(now = new Date()): DailyMissionsState {
  const todayKey = getTodayDateKey(now);
  try {
    const raw = localStorage.getItem(DAILY_MISSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyMissionsState;
      if (
        parsed &&
        parsed.dateKey === todayKey &&
        Array.isArray(parsed.missions) &&
        parsed.missions.length === 3
      ) {
        return parsed;
      }
    }
  } catch {
    // Fall back to fresh missions
  }

  const fresh: DailyMissionsState = {
    dateKey: todayKey,
    missions: generateMissionsForDate(todayKey),
  };
  saveDailyMissions(fresh);
  return fresh;
}

export function saveDailyMissions(state: DailyMissionsState): void {
  try {
    localStorage.setItem(DAILY_MISSIONS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota / privacy errors
  }
}

export function getActiveDailyMultiplier(state: DailyMissionsState): number {
  const bonus = state.missions.reduce(
    (sum, m) => sum + (m.completed ? m.bonusMultiplier : 0),
    0
  );
  return Math.round((1 + bonus) * 100) / 100;
}

export function applyRunMissionProgress(
  prevDaily: DailyMissionsState,
  deltas: {
    blocksDestroyed: number;
    powerupsCollected: number;
    bombsDetonated: number;
  },
  peaks: {
    turn: number;
    maxBalls: number;
    peakChain: number;
  }
): {
  nextDaily: DailyMissionsState;
  newlyCompleted: DailyMissionProgress[];
  changed: boolean;
} {
  const todayKey = getTodayDateKey();
  const baseDaily =
    prevDaily.dateKey === todayKey ? prevDaily : loadDailyMissions();

  let changed = baseDaily.dateKey !== prevDaily.dateKey;
  const newlyCompleted: DailyMissionProgress[] = [];

  const updatedMissions = baseDaily.missions.map((mission) => {
    let nextProgress = mission.progress;

    if (mission.metric === 'blocks_destroyed' && deltas.blocksDestroyed > 0) {
      nextProgress = Math.min(mission.target, mission.progress + deltas.blocksDestroyed);
    } else if (
      mission.metric === 'powerups_collected' &&
      deltas.powerupsCollected > 0
    ) {
      nextProgress = Math.min(
        mission.target,
        mission.progress + deltas.powerupsCollected
      );
    } else if (mission.metric === 'bombs_detonated' && deltas.bombsDetonated > 0) {
      nextProgress = Math.min(mission.target, mission.progress + deltas.bombsDetonated);
    } else if (mission.metric === 'reach_turn') {
      nextProgress = Math.min(mission.target, Math.max(mission.progress, peaks.turn));
    } else if (mission.metric === 'max_balls') {
      nextProgress = Math.min(
        mission.target,
        Math.max(mission.progress, peaks.maxBalls)
      );
    } else if (mission.metric === 'chain_multiplier') {
      nextProgress = Math.min(
        mission.target,
        Math.max(mission.progress, peaks.peakChain)
      );
    }

    const becameCompleted = !mission.completed && nextProgress >= mission.target;
    if (nextProgress !== mission.progress || becameCompleted) {
      changed = true;
    }

    const updated: DailyMissionProgress = {
      ...mission,
      progress: nextProgress,
      completed: mission.completed || becameCompleted,
      completedAt: becameCompleted
        ? new Date().toISOString()
        : mission.completedAt,
    };

    if (becameCompleted) {
      newlyCompleted.push(updated);
    }

    return updated;
  });

  if (!changed) {
    return { nextDaily: baseDaily, newlyCompleted: [], changed: false };
  }

  const nextDaily: DailyMissionsState = {
    dateKey: todayKey,
    missions: updatedMissions,
  };
  saveDailyMissions(nextDaily);
  return { nextDaily, newlyCompleted, changed: true };
}

export function getTimeUntilMidnightLabel(now = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffMs = Math.max(0, midnight.getTime() - now.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
