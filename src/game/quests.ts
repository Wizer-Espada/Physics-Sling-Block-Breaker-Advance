import { DifficultyMode } from './types.ts';

export type MasteryQuestMetric =
  | 'blocks_destroyed'
  | 'reach_turn_standard_or_hard'
  | 'reach_turn_overdrive'
  | 'chain_multiplier'
  | 'shield_saves'
  | 'bombs_detonated';

export interface MasteryQuestDefinition {
  id: string;
  category: 'Combat' | 'Endurance' | 'Defense' | 'Mastery';
  title: string;
  description: string;
  metric: MasteryQuestMetric;
  target: number;
  bonusMultiplier: number;
}

export interface MasteryQuestProgress extends MasteryQuestDefinition {
  progress: number;
  completed: boolean;
  completedAt: string | null;
}

export interface MasteryQuestsState {
  quests: MasteryQuestProgress[];
}

const MASTERY_QUESTS_STORAGE_KEY = 'prism_sling_mastery_quests_v1';
const DIFFICULTY_STORAGE_KEY = 'prism_sling_difficulty_v1';

const MASTERY_QUEST_DEFINITIONS: MasteryQuestDefinition[] = [
  {
    id: 'quest_prism_demolition',
    category: 'Combat',
    title: 'Prism Demolition',
    description: 'Destroy 250 blocks across all runs',
    metric: 'blocks_destroyed',
    target: 250,
    bonusMultiplier: 0.15,
  },
  {
    id: 'quest_tier_climber',
    category: 'Endurance',
    title: 'Tier Climber',
    description: 'Reach Turn 10 on Standard or Overdrive',
    metric: 'reach_turn_standard_or_hard',
    target: 10,
    bonusMultiplier: 0.15,
  },
  {
    id: 'quest_overdrive_survivor',
    category: 'Mastery',
    title: 'Overdrive Veteran',
    description: 'Reach Turn 8 on Overdrive difficulty',
    metric: 'reach_turn_overdrive',
    target: 8,
    bonusMultiplier: 0.25,
  },
  {
    id: 'quest_cascade_architect',
    category: 'Combat',
    title: 'Cascade Architect',
    description: 'Land a ×6 brick destruction chain in one shot',
    metric: 'chain_multiplier',
    target: 6,
    bonusMultiplier: 0.15,
  },
  {
    id: 'quest_aegis_guardian',
    category: 'Defense',
    title: 'Aegis Guardian',
    description: 'Clear 3 danger breaches using Aegis Shields',
    metric: 'shield_saves',
    target: 3,
    bonusMultiplier: 0.1,
  },
  {
    id: 'quest_blast_tactician',
    category: 'Mastery',
    title: 'Blast Tactician',
    description: 'Detonate 12 Bomb power-ups across runs',
    metric: 'bombs_detonated',
    target: 12,
    bonusMultiplier: 0.1,
  },
];

export function loadSelectedDifficulty(): DifficultyMode {
  try {
    const raw = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    if (raw === 'relaxed' || raw === 'standard' || raw === 'overdrive') {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'standard';
}

export function saveSelectedDifficulty(mode: DifficultyMode): void {
  try {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

export function loadMasteryQuests(): MasteryQuestsState {
  try {
    const raw = localStorage.getItem(MASTERY_QUESTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MasteryQuestsState>;
      if (parsed && Array.isArray(parsed.quests)) {
        const byId = new Map(parsed.quests.map((q) => [q.id, q]));
        const merged = MASTERY_QUEST_DEFINITIONS.map((def) => {
          const existing = byId.get(def.id);
          if (!existing) {
            return {
              ...def,
              progress: 0,
              completed: false,
              completedAt: null,
            };
          }
          const progress = Math.min(def.target, Math.max(0, existing.progress || 0));
          const completed = Boolean(existing.completed) || progress >= def.target;
          return {
            ...def,
            progress,
            completed,
            completedAt: existing.completedAt ?? null,
          };
        });
        return { quests: merged };
      }
    }
  } catch {
    // Fall back to fresh quest state
  }

  const fresh: MasteryQuestsState = {
    quests: MASTERY_QUEST_DEFINITIONS.map((def) => ({
      ...def,
      progress: 0,
      completed: false,
      completedAt: null,
    })),
  };
  saveMasteryQuests(fresh);
  return fresh;
}

export function saveMasteryQuests(state: MasteryQuestsState): void {
  try {
    localStorage.setItem(MASTERY_QUESTS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function getMasteryQuestBonus(state: MasteryQuestsState): number {
  const bonus = state.quests.reduce(
    (sum, q) => sum + (q.completed ? q.bonusMultiplier : 0),
    0
  );
  return Math.round(bonus * 100) / 100;
}

export function applyRunMasteryQuestProgress(
  prev: MasteryQuestsState,
  deltas: {
    blocksDestroyed: number;
    bombsDetonated: number;
    shieldSaves: number;
  },
  peaks: {
    turn: number;
    peakChain: number;
    difficultyMode: DifficultyMode;
  }
): {
  nextQuests: MasteryQuestsState;
  newlyCompleted: MasteryQuestProgress[];
  changed: boolean;
} {
  let changed = false;
  const newlyCompleted: MasteryQuestProgress[] = [];

  const updated = prev.quests.map((quest) => {
    let nextProgress = quest.progress;

    if (quest.metric === 'blocks_destroyed' && deltas.blocksDestroyed > 0) {
      nextProgress = Math.min(quest.target, quest.progress + deltas.blocksDestroyed);
    } else if (quest.metric === 'bombs_detonated' && deltas.bombsDetonated > 0) {
      nextProgress = Math.min(quest.target, quest.progress + deltas.bombsDetonated);
    } else if (quest.metric === 'shield_saves' && deltas.shieldSaves > 0) {
      nextProgress = Math.min(quest.target, quest.progress + deltas.shieldSaves);
    } else if (
      quest.metric === 'reach_turn_standard_or_hard' &&
      (peaks.difficultyMode === 'standard' || peaks.difficultyMode === 'overdrive')
    ) {
      nextProgress = Math.min(quest.target, Math.max(quest.progress, peaks.turn));
    } else if (
      quest.metric === 'reach_turn_overdrive' &&
      peaks.difficultyMode === 'overdrive'
    ) {
      nextProgress = Math.min(quest.target, Math.max(quest.progress, peaks.turn));
    } else if (quest.metric === 'chain_multiplier') {
      nextProgress = Math.min(quest.target, Math.max(quest.progress, peaks.peakChain));
    }

    const becameCompleted = !quest.completed && nextProgress >= quest.target;
    if (nextProgress !== quest.progress || becameCompleted) {
      changed = true;
    }

    const nextQuest: MasteryQuestProgress = {
      ...quest,
      progress: nextProgress,
      completed: quest.completed || becameCompleted,
      completedAt: becameCompleted
        ? new Date().toISOString()
        : quest.completedAt,
    };

    if (becameCompleted) {
      newlyCompleted.push(nextQuest);
    }

    return nextQuest;
  });

  if (!changed) {
    return { nextQuests: prev, newlyCompleted: [], changed: false };
  }

  const nextQuests: MasteryQuestsState = { quests: updated };
  saveMasteryQuests(nextQuests);
  return { nextQuests, newlyCompleted, changed: true };
}
