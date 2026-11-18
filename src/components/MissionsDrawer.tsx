import { useState } from 'react';
import { CheckCircle2, Flame, SlidersHorizontal, X } from 'lucide-react';
import { AudioChannel, AudioVolumeSettings } from '../game/audio.ts';
import {
  DailyMissionsState,
  getActiveDailyMultiplier,
  getTimeUntilMidnightLabel,
} from '../game/missions.ts';
import {
  getEffectiveMissionStreak,
  getEffectivePlayStreak,
  PlayerProgressState,
} from '../game/progress.ts';
import { getMasteryQuestBonus, MasteryQuestsState } from '../game/quests.ts';
import { AudioSettingsPanel } from './AudioSettingsPanel.tsx';

interface MissionsDrawerProps {
  dailyState: DailyMissionsState;
  masteryState: MasteryQuestsState;
  playerProgress: PlayerProgressState;
  audioVolumes: AudioVolumeSettings;
  muted: boolean;
  onChangeAudioVolume: (channel: AudioChannel, value: number) => void;
  onToggleMute: () => void;
  onResetAudioVolumes: () => void;
  onTestSfx: () => void;
  onClose: () => void;
}

const GAME_LOGO_URL = '/src/assets/images/prism_sling_logo_1794866373917.jpg';

export function MissionsDrawer({
  dailyState,
  masteryState,
  playerProgress,
  audioVolumes,
  muted,
  onChangeAudioVolume,
  onToggleMute,
  onResetAudioVolumes,
  onTestSfx,
  onClose,
}: MissionsDrawerProps) {
  const [tab, setTab] = useState<'daily' | 'mastery' | 'audio'>('daily');
  const dailyMultiplier = getActiveDailyMultiplier(dailyState);
  const masteryBonus = getMasteryQuestBonus(masteryState);
  const activeMultiplier = Math.round((dailyMultiplier + masteryBonus) * 100) / 100;
  const completedDailyCount = dailyState.missions.filter((m) => m.completed).length;
  const completedMasteryCount = masteryState.quests.filter((q) => q.completed).length;
  const resetLabel = getTimeUntilMidnightLabel();
  const playStreak = getEffectivePlayStreak(playerProgress, dailyState.dateKey);
  const missionStreak = getEffectiveMissionStreak(
    playerProgress,
    dailyState.dateKey
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="missions-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b14]/88"
    >
      <div className="w-full max-w-[460px] max-h-[86dvh] flex flex-col rounded-2xl bg-[#0b1120] border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header with game thumbnail emblem */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-900 shrink-0">
              <img
                src={GAME_LOGO_URL}
                alt="Prism Sling logo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover scale-[1.12]"
              />
            </div>
            <div className="min-w-0">
              <h2
                id="missions-title"
                className="font-display text-lg font-bold text-white leading-tight"
              >
                Quests &amp; Missions
              </h2>
              <p className="text-xs text-slate-400 font-mono-num">
                {dailyState.dateKey} · Daily resets in {resetLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close daily missions"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Drawer Tabs */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('daily')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'daily'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Daily ({completedDailyCount}/{dailyState.missions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('mastery')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'mastery'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Mastery ({completedMasteryCount}/{masteryState.quests.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('audio')}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'audio'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Audio</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'audio' ? (
            <AudioSettingsPanel
              volumes={audioVolumes}
              muted={muted}
              onChangeVolume={onChangeAudioVolume}
              onToggleMute={onToggleMute}
              onResetVolumes={onResetAudioVolumes}
              onTestSfx={onTestSfx}
            />
          ) : (
            <>
              {/* Active Bonus & Streaks Summary (unboxed metric strip) */}
              <div className="pb-4 border-b border-slate-800 grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    Score Bonus
                  </span>
                  <span
                    className={`font-mono-num text-xl font-bold mt-0.5 block ${
                      activeMultiplier > 1 ? 'text-emerald-400' : 'text-white'
                    }`}
                  >
                    {activeMultiplier.toFixed(2)}×
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-slate-400 block">
                    Play Streak
                  </span>
                  <span className="font-mono-num text-xl font-bold text-amber-400 mt-0.5 inline-flex items-center gap-1">
                    <Flame className="w-4 h-4 shrink-0" />
                    {playStreak}d
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block">
                    {tab === 'daily' ? 'Done Today' : 'Mastery Done'}
                  </span>
                  <span className="font-mono-num text-xl font-bold text-cyan-400 mt-0.5 block">
                    {tab === 'daily'
                      ? `${completedDailyCount}/${dailyState.missions.length}`
                      : `${completedMasteryCount}/${masteryState.quests.length}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Mission Streak:{' '}
                  <strong className="font-mono-num text-slate-200">
                    {missionStreak} {missionStreak === 1 ? 'day' : 'days'}
                  </strong>
                </span>
                <span>
                  Best Streak:{' '}
                  <strong className="font-mono-num text-slate-200">
                    {Math.max(
                      playerProgress.bestPlayStreak,
                      playerProgress.bestMissionStreak
                    )}
                    d
                  </strong>
                </span>
              </div>

              {/* Hairline-divided Quest Rows */}
              {tab === 'daily' ? (
            <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
              {dailyState.missions.map((mission) => {
                const pct = Math.min(
                  100,
                  Math.round((mission.progress / mission.target) * 100)
                );

                return (
                  <div key={mission.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug">
                          {mission.title}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {mission.description}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5 text-right">
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
              {masteryState.quests.map((quest) => {
                const pct = Math.min(
                  100,
                  Math.round((quest.progress / quest.target) * 100)
                );

                return (
                  <div key={quest.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
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

                      <div className="shrink-0 flex items-center gap-1.5 text-right">
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

              <p className="text-xs text-slate-400 leading-relaxed">
                Daily missions and Mastery quests stack together onto every hit,
                block break, and chain bonus across your runs.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
