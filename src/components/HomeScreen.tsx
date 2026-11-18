import { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Crown,
  Flame,
  Gift,
  Play,
  RotateCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  DAILY_REWARD_MULTIPLIER_BOOST,
  DailyRewardState,
} from '../game/dailyReward.ts';
import {
  DailyMissionsState,
  getActiveDailyMultiplier,
  getTimeUntilMidnightLabel,
} from '../game/missions.ts';
import { SavedActiveRun } from '../game/progress.ts';
import {
  getMasteryQuestBonus,
  MasteryQuestsState,
} from '../game/quests.ts';
import {
  DIFFICULTY_CONFIGS,
  DailyRewardChoice,
  DifficultyMode,
} from '../game/types.ts';
import {
  GlobalActivityBar,
  GlobalActivityEntry,
} from './GlobalActivityBar.tsx';
import { LeaderboardEntry } from './LeaderboardDrawer.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface HomeScreenProps {
  selectedDifficulty: DifficultyMode;
  onSelectDifficulty: (mode: DifficultyMode) => void;
  dailyMissions: DailyMissionsState;
  masteryQuests: MasteryQuestsState;
  dailyReward: DailyRewardState;
  onSelectDailyRewardChoice: (choice: DailyRewardChoice) => void;
  onClaimDailyReward: () => void;
  bestScore: number;
  topGlobalScore: LeaderboardEntry | null;
  globalActivity: GlobalActivityEntry[];
  globalActivityLoading: boolean;
  globalActivityError: string | null;
  playStreak: number;
  totalMultiplier: number;
  savedRun: SavedActiveRun | null;
  muted: boolean;
  onToggleMute: () => void;
  onStartNewRun: () => void;
  onResumeRun: () => void;
  onOpenLeaderboard: () => void;
  onOpenTopRankings: () => void;
  onRefreshGlobalActivity: () => void;
}

const GAME_LOGO_URL = '/src/assets/images/prism_sling_logo_1794866373917.jpg';

const DIFFICULTY_ORDER: DifficultyMode[] = ['relaxed', 'standard', 'overdrive'];

export function HomeScreen({
  selectedDifficulty,
  onSelectDifficulty,
  dailyMissions,
  masteryQuests,
  dailyReward,
  onSelectDailyRewardChoice,
  onClaimDailyReward,
  bestScore,
  topGlobalScore,
  globalActivity,
  globalActivityLoading,
  globalActivityError,
  playStreak,
  totalMultiplier,
  savedRun,
  muted,
  onToggleMute,
  onStartNewRun,
  onResumeRun,
  onOpenLeaderboard,
  onOpenTopRankings,
  onRefreshGlobalActivity,
}: HomeScreenProps) {
  const [questTab, setQuestTab] = useState<'daily' | 'mastery'>('daily');

  const activeDifficulty = DIFFICULTY_CONFIGS[selectedDifficulty];
  const dailyDone = dailyMissions.missions.filter((m) => m.completed).length;
  const masteryDone = masteryQuests.quests.filter((q) => q.completed).length;
  const dailyBonus = getActiveDailyMultiplier(dailyMissions) - 1;
  const masteryBonus = getMasteryQuestBonus(masteryQuests);
  const resetLabel = getTimeUntilMidnightLabel();

  const savedDiffLabel = savedRun?.difficultyMode
    ? DIFFICULTY_CONFIGS[savedRun.difficultyMode].label
    : 'Standard';

  return (
    <div className="w-full h-full flex flex-col bg-[#0f172a]">
      {/* Top Brand Header */}
      <header className="shrink-0 px-4 py-3 bg-[#0b1120] border-b border-slate-800/90 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-900 shrink-0">
            <img
              src={GAME_LOGO_URL}
              alt="Prism Sling logo"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-[1.12]"
            />
          </div>

          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-white leading-tight truncate">
              Prism Sling
            </h1>
            <p className="text-[11px] text-slate-400 font-mono-num truncate">
              Best {bestScore.toLocaleString()} · {playStreak}d Streak
              {totalMultiplier > 1 ? ` · ${totalMultiplier.toFixed(2)}×` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <PWAInstallButton />

          <button
            type="button"
            onClick={onOpenLeaderboard}
            aria-label="Stats and leaderboard"
            title="Stats & Leaderboard"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-amber-300 hover:bg-slate-800/80 active:scale-95 transition-colors"
          >
            <Trophy className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            title={muted ? 'Unmute' : 'Mute'}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-colors"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-slate-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>
        </div>
      </header>

      {/* Scrollable Home Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
        {/* Global #1 Top Score Spotlight */}
        <button
          type="button"
          onClick={onOpenTopRankings}
          className="w-full min-h-[54px] px-3.5 py-2.5 rounded-xl border border-amber-400/35 bg-slate-900/80 hover:bg-slate-900 hover:border-amber-400/60 transition-colors active:scale-[0.99] flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Crown className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-amber-300 leading-tight">
                {topGlobalScore ? '#1 Top Score' : 'Global Leaderboard'}
              </p>
              <p className="text-xs text-slate-300 truncate mt-0.5">
                {topGlobalScore ? (
                  <>
                    <span className="font-semibold text-white">
                      {topGlobalScore.playerName}
                    </span>
                    {topGlobalScore.isYou ? (
                      <span className="text-cyan-400 font-semibold"> · You</span>
                    ) : null}
                    <span className="text-slate-400 font-mono-num">
                      {' '}· Turn {topGlobalScore.turn}
                    </span>
                  </>
                ) : (
                  'Play a run to set the #1 Top Score'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-mono-num text-sm font-bold text-amber-300">
              {topGlobalScore ? topGlobalScore.score.toLocaleString() : 'Rank #1'}
            </span>
            <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
          </div>
        </button>

        {/* Difficulty Level Selection */}
        <section aria-labelledby="difficulty-heading" className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="difficulty-heading"
              className="text-xs font-semibold text-slate-300"
            >
              Difficulty Level
            </h2>
            <span className="font-mono-num text-[11px] text-slate-400">
              {activeDifficulty.scoreMult.toFixed(2).replace(/\.?0+$/, '')}× Score Rate
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Difficulty level"
            className="grid grid-cols-3 gap-2"
          >
            {DIFFICULTY_ORDER.map((mode) => {
              const cfg = DIFFICULTY_CONFIGS[mode];
              const isSelected = selectedDifficulty === mode;
              const accentBorder =
                mode === 'relaxed'
                  ? 'border-emerald-400/90 bg-emerald-500/12'
                  : mode === 'overdrive'
                    ? 'border-amber-400/90 bg-amber-500/12'
                    : 'border-cyan-400/90 bg-cyan-500/12';
              const accentTitle =
                mode === 'relaxed'
                  ? 'text-emerald-300'
                  : mode === 'overdrive'
                    ? 'text-amber-300'
                    : 'text-cyan-300';

              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectDifficulty(mode)}
                  className={`min-h-[82px] px-2.5 py-2.5 rounded-xl border text-left transition-colors active:scale-[0.98] flex flex-col justify-between ${
                    isSelected
                      ? accentBorder
                      : 'border-slate-800 bg-slate-900/75 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs sm:text-sm font-bold whitespace-nowrap ${
                        isSelected ? accentTitle : 'text-white'
                      }`}
                    >
                      {cfg.label}
                    </span>
                    {mode === 'overdrive' ? (
                      <Zap
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-amber-400' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                    ) : mode === 'relaxed' ? (
                      <Shield
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                    ) : (
                      <Sparkles
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'text-cyan-400' : 'text-slate-500'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="mt-2 space-y-0.5 font-mono-num text-[11px] leading-tight">
                    <p className="text-slate-200 whitespace-nowrap">
                      {cfg.hpLabel}
                    </p>
                    <p className="text-slate-400 whitespace-nowrap">
                      {cfg.startingShields}{' '}
                      {cfg.startingShields === 1 ? 'Shield' : 'Shields'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {activeDifficulty.description}
          </p>
        </section>

        {/* Daily First-Run Reward */}
        <section aria-labelledby="daily-reward-heading" className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="daily-reward-heading"
              className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Daily Reward</span>
            </h2>
            <span
              className={`font-mono-num text-[11px] ${
                dailyReward.consumed
                  ? 'text-slate-400'
                  : dailyReward.claimed
                    ? 'text-emerald-400'
                    : 'text-amber-300'
              }`}
            >
              {dailyReward.consumed
                ? `Claimed · Resets in ${resetLabel}`
                : dailyReward.claimed
                  ? 'Ready for next run'
                  : 'First run of the day'}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2.5">
            {dailyReward.consumed ? (
              <div className="flex items-center gap-2.5 text-xs">
                <CheckCircle2
                  className="w-4 h-4 text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-200">
                    {dailyReward.selectedReward === 'multiplier_boost'
                      ? `+${DAILY_REWARD_MULTIPLIER_BOOST.toFixed(2)}× Mission Multiplier granted today`
                      : '+1 Starter Aegis Shield granted today'}
                  </p>
                  <p className="text-slate-400 mt-0.5">
                    Your next first-run reward unlocks in {resetLabel}.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div
                  role="radiogroup"
                  aria-label="Daily reward bonus"
                  className="grid grid-cols-2 gap-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={dailyReward.selectedReward === 'multiplier_boost'}
                    onClick={() => onSelectDailyRewardChoice('multiplier_boost')}
                    className={`min-h-[54px] px-3 py-2 rounded-lg border text-left transition-colors active:scale-[0.98] flex items-center gap-2.5 ${
                      dailyReward.selectedReward === 'multiplier_boost'
                        ? 'border-amber-400/90 bg-amber-500/12 text-amber-200'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Sparkles
                      className={`w-4 h-4 shrink-0 ${
                        dailyReward.selectedReward === 'multiplier_boost'
                          ? 'text-amber-300'
                          : 'text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-mono-num text-xs font-bold whitespace-nowrap">
                        +{DAILY_REWARD_MULTIPLIER_BOOST.toFixed(2)}× Mult
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Score boost
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={dailyReward.selectedReward === 'starter_shield'}
                    onClick={() => onSelectDailyRewardChoice('starter_shield')}
                    className={`min-h-[54px] px-3 py-2 rounded-lg border text-left transition-colors active:scale-[0.98] flex items-center gap-2.5 ${
                      dailyReward.selectedReward === 'starter_shield'
                        ? 'border-sky-400/90 bg-sky-500/12 text-sky-200'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <ShieldCheck
                      className={`w-4 h-4 shrink-0 ${
                        dailyReward.selectedReward === 'starter_shield'
                          ? 'text-sky-300'
                          : 'text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="font-mono-num text-xs font-bold whitespace-nowrap">
                        +1 Shield
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Starter guard
                      </p>
                    </div>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {dailyReward.claimed ? (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Claimed — applies on your next run start</span>
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-400">
                        One-time boost for today&apos;s first run
                      </p>
                      <button
                        type="button"
                        onClick={onClaimDailyReward}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
                      >
                        Claim Reward
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Quests Section (Daily + Mastery Tracks) */}
        <section aria-labelledby="quests-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="quests-heading"
              className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Quests</span>
            </h2>
            <span className="font-mono-num text-[11px] text-slate-400">
              {questTab === 'daily'
                ? `Resets in ${resetLabel}`
                : `+${masteryBonus.toFixed(2)}× Permanent Bonus`}
            </span>
          </div>

          {/* Segmented Quest Category Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setQuestTab('daily')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                questTab === 'daily'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Daily Quests</span>
              <span className="font-mono-num text-cyan-400">
                {dailyDone}/{dailyMissions.missions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQuestTab('mastery')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                questTab === 'mastery'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Mastery Quests</span>
              <span className="font-mono-num text-amber-400">
                {masteryDone}/{masteryQuests.quests.length}
              </span>
            </button>
          </div>

          {/* Quest Progress Rows */}
          {questTab === 'daily' ? (
            <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
              {dailyMissions.missions.map((mission) => {
                const pct = Math.min(
                  100,
                  Math.round((mission.progress / mission.target) * 100)
                );
                return (
                  <div key={mission.id} className="px-3.5 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">
                          {mission.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {mission.description}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {mission.completed && (
                          <CheckCircle2
                            className="w-4 h-4 text-emerald-400 shrink-0"
                            aria-label="Completed"
                          />
                        )}
                        <span
                          className={`font-mono-num text-xs font-bold whitespace-nowrap ${
                            mission.completed
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          +{mission.bonusMultiplier.toFixed(2)}×
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={mission.progress}
                        aria-valuemin={0}
                        aria-valuemax={mission.target}
                        aria-label={mission.title}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-200 ${
                            mission.completed ? 'bg-emerald-400' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <span
                        className={`font-mono-num text-xs font-semibold shrink-0 ${
                          mission.completed ? 'text-emerald-400' : 'text-slate-300'
                        }`}
                      >
                        {mission.completed
                          ? 'Done'
                          : `${mission.progress} / ${mission.target}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
              {masteryQuests.quests.map((quest) => {
                const pct = Math.min(
                  100,
                  Math.round((quest.progress / quest.target) * 100)
                );
                return (
                  <div key={quest.id} className="px-3.5 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">
                          {quest.title}
                          <span className="text-[11px] font-normal text-slate-400 ml-1.5">
                            · {quest.category}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {quest.description}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {quest.completed && (
                          <CheckCircle2
                            className="w-4 h-4 text-emerald-400 shrink-0"
                            aria-label="Completed"
                          />
                        )}
                        <span
                          className={`font-mono-num text-xs font-bold whitespace-nowrap ${
                            quest.completed
                              ? 'text-emerald-400'
                              : 'text-amber-400'
                          }`}
                        >
                          +{quest.bonusMultiplier.toFixed(2)}×
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div
                        className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={quest.progress}
                        aria-valuemin={0}
                        aria-valuemax={quest.target}
                        aria-label={quest.title}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-200 ${
                            quest.completed ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <span
                        className={`font-mono-num text-xs font-semibold shrink-0 ${
                          quest.completed ? 'text-emerald-400' : 'text-slate-300'
                        }`}
                      >
                        {quest.completed
                          ? 'Done'
                          : `${quest.progress} / ${quest.target}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stacked Multiplier & Streak Footer Line */}
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono-num">
            <span className="inline-flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              Daily +{dailyBonus.toFixed(2)}× · Mastery +{masteryBonus.toFixed(2)}×
            </span>
            <span className="text-emerald-400 font-semibold">
              Total {totalMultiplier.toFixed(2)}×
            </span>
          </div>
        </section>
      </div>

      {/* Real-time Global Activity Scroll Bar */}
      <GlobalActivityBar
        entries={globalActivity}
        loading={globalActivityLoading}
        error={globalActivityError}
        userBestScore={bestScore}
        onOpenRankings={onOpenTopRankings}
        onRefresh={onRefreshGlobalActivity}
      />

      {/* Bottom Launch Bar */}
      <footer className="shrink-0 px-4 py-3 bg-[#0b1120] border-t border-slate-800/90 flex items-center gap-2">
        {savedRun && (
          <button
            type="button"
            onClick={onResumeRun}
            className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
          >
            <RotateCw className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              Resume T{savedRun.turn} ({savedDiffLabel})
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onStartNewRun}
          className="flex-1 min-h-[48px] px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap"
        >
          <Play className="w-4 h-4 fill-current shrink-0" />
          <span>Play {activeDifficulty.label}</span>
        </button>
      </footer>
    </div>
  );
}
