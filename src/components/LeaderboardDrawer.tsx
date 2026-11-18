import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Flame,
  History,
  LogOut,
  Pencil,
  SlidersHorizontal,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { AudioChannel, AudioVolumeSettings } from '../game/audio.ts';
import { DailyMissionsState } from '../game/missions.ts';
import {
  getEffectiveMissionStreak,
  getEffectivePlayStreak,
  getSevenDayMissionHistory,
  PlayerProgressState,
} from '../game/progress.ts';
import { DIFFICULTY_CONFIGS } from '../game/types.ts';
import { AudioSettingsPanel } from './AudioSettingsPanel.tsx';

export interface LeaderboardEntry {
  id: number;
  rank?: number;
  playerName: string;
  score: number;
  turn: number;
  maxBalls: number;
  powerupsCollected: number;
  createdAt: string;
  isYou?: boolean;
}

export interface GlobalRankSummary {
  rank: number;
  playerName: string;
  score: number;
  turn: number;
}

export interface PlayerProfileSummary {
  bestScore: number;
  bestTurn: number;
  totalRuns: number;
  cloudStreak?: number;
  recentRuns: Array<{
    id: number;
    score: number;
    turn: number;
    maxBalls: number;
    powerupsCollected: number;
    createdAt: string;
  }>;
}

interface LeaderboardDrawerProps {
  entries: LeaderboardEntry[];
  topScore: LeaderboardEntry | null;
  totalPlayers: number;
  myRank: GlobalRankSummary | null;
  playerName: string;
  savingPlayerName: boolean;
  initialTab?: 'progress' | 'rankings' | 'audio';
  profile: PlayerProfileSummary | null;
  playerProgress: PlayerProgressState;
  dailyMissions?: DailyMissionsState;
  loading: boolean;
  error: string | null;
  userEmail: string | null;
  userName: string | null;
  audioVolumes: AudioVolumeSettings;
  muted: boolean;
  onChangeAudioVolume: (channel: AudioChannel, value: number) => void;
  onToggleMute: () => void;
  onResetAudioVolumes: () => void;
  onTestSfx: () => void;
  onSavePlayerName: (name: string) => Promise<void>;
  onClose: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

const GAME_LOGO_URL = '/src/assets/images/prism_sling_logo_1794866373917.jpg';

function formatRunDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function LeaderboardDrawer({
  entries,
  topScore,
  totalPlayers,
  myRank,
  playerName,
  savingPlayerName,
  initialTab = 'progress',
  profile,
  playerProgress,
  dailyMissions,
  loading,
  error,
  userEmail,
  userName,
  audioVolumes,
  muted,
  onChangeAudioVolume,
  onToggleMute,
  onResetAudioVolumes,
  onTestSfx,
  onSavePlayerName,
  onClose,
  onSignIn,
  onSignOut,
}: LeaderboardDrawerProps) {
  const [tab, setTab] = useState<'progress' | 'rankings' | 'audio'>(initialTab);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [draftName, setDraftName] = useState<string>(playerName);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setDraftName(playerName);
  }, [playerName]);

  const sevenDayHistory = getSevenDayMissionHistory(playerProgress, dailyMissions);
  const defaultSelectedKey =
    sevenDayHistory[sevenDayHistory.length - 1]?.dateKey ?? '';
  const [selectedDayKey, setSelectedDayKey] = useState<string>(defaultSelectedKey);
  const selectedDay =
    sevenDayHistory.find((d) => d.dateKey === selectedDayKey) ??
    sevenDayHistory[sevenDayHistory.length - 1];

  const totalMissions7d = sevenDayHistory.reduce(
    (sum, d) => sum + d.missionsCompleted,
    0
  );
  const totalPossible7d = sevenDayHistory.reduce(
    (sum, d) => sum + d.missionsTarget,
    0
  );
  const activeDays7d = sevenDayHistory.filter((d) => d.played).length;

  const localPlayStreak = getEffectivePlayStreak(playerProgress);
  const playStreak = Math.max(localPlayStreak, profile?.cloudStreak ?? 0);
  const bestPlayStreak = Math.max(
    playerProgress.bestPlayStreak,
    playStreak
  );
  const missionStreak = getEffectiveMissionStreak(playerProgress);
  const combinedBestScore = Math.max(
    playerProgress.bestScore,
    profile?.bestScore ?? 0
  );
  const combinedBestTurn = Math.max(
    playerProgress.highestTurn,
    profile?.bestTurn ?? 0
  );
  const combinedTotalRuns = Math.max(
    playerProgress.totalRuns,
    profile?.totalRuns ?? 0
  );

  // Merge local saved runs with any cloud-only runs if signed in, deduplicated loosely by timestamp/score
  const displayRuns =
    playerProgress.recentRuns.length > 0
      ? playerProgress.recentRuns.map((r) => ({
          id: r.id,
          score: r.score,
          turn: r.turn,
          maxBalls: r.maxBalls,
          peakChain: r.peakChain,
          blocksDestroyed: r.blocksDestroyed,
          difficultyLabel: r.difficultyMode
            ? DIFFICULTY_CONFIGS[r.difficultyMode].label
            : null,
          dateStr: r.playedAt,
        }))
      : (profile?.recentRuns ?? []).map((r) => ({
          id: String(r.id),
          score: r.score,
          turn: r.turn,
          maxBalls: r.maxBalls,
          peakChain: 0,
          blocksDestroyed: 0,
          difficultyLabel: null,
          dateStr: r.createdAt,
        }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leaderboard-title"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#070b14]/88"
    >
      <div className="w-full max-w-[480px] max-h-[86dvh] flex flex-col rounded-2xl bg-[#0b1120] border border-slate-700/80 shadow-2xl overflow-hidden">
        {/* Header with game thumbnail logo */}
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
                id="leaderboard-title"
                className="font-display text-lg font-bold text-white leading-tight truncate"
              >
                Progress &amp; Rankings
              </h2>
              <p className="text-xs text-slate-400 font-mono-num">
                {playStreak}d Play Streak · {combinedTotalRuns} Saved Runs
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close progress and rankings"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Segmented Tabs */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('progress')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'progress'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>History</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('rankings')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'rankings'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Rankings</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('audio')}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'audio' ? (
            <AudioSettingsPanel
              volumes={audioVolumes}
              muted={muted}
              onChangeVolume={onChangeAudioVolume}
              onToggleMute={onToggleMute}
              onResetVolumes={onResetAudioVolumes}
              onTestSfx={onTestSfx}
            />
          ) : tab === 'progress' ? (
            <>
              {/* Streaks Summary (unboxed metric strip) */}
              <div className="pb-4 border-b border-slate-800 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-slate-400 block">
                    Play Streak
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="font-mono-num text-2xl font-bold text-amber-400 inline-flex items-center gap-1">
                      <Flame className="w-5 h-5 shrink-0" />
                      {playStreak} {playStreak === 1 ? 'day' : 'days'}
                    </span>
                    <span className="font-mono-num text-xs text-slate-400">
                      Best {bestPlayStreak}d
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-400 block">
                    Mission Streak
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="font-mono-num text-2xl font-bold text-emerald-400">
                      {missionStreak} {missionStreak === 1 ? 'day' : 'days'}
                    </span>
                    <span className="font-mono-num text-xs text-slate-400">
                      Best {playerProgress.bestMissionStreak}d
                    </span>
                  </div>
                </div>
              </div>

              {/* 7-Day Mission & Play Streak Bar Graph */}
              <div className="pb-4 border-b border-slate-800">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h3 className="text-xs font-semibold text-slate-300">
                    7-Day Mission History
                  </h3>
                  <span className="font-mono-num text-[11px] text-slate-400">
                    {totalMissions7d}/{totalPossible7d} Done · {activeDays7d}/7 Played
                  </span>
                </div>

                <div
                  className="grid grid-cols-7 gap-1.5"
                  role="group"
                  aria-label="7-day completed missions bar graph"
                >
                  {sevenDayHistory.map((day) => {
                    const isSelected = selectedDay?.dateKey === day.dateKey;
                    const allDone = day.missionsCompleted >= day.missionsTarget;
                    const hasMissions = day.missionsCompleted > 0;
                    const tiers = Array.from(
                      { length: day.missionsTarget },
                      (_, idx) => day.missionsTarget - idx
                    );

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() => setSelectedDayKey(day.dateKey)}
                        aria-pressed={isSelected}
                        aria-label={`${day.shortDateLabel}: ${day.missionsCompleted} of ${day.missionsTarget} missions completed${day.played ? ', played' : ''}`}
                        className={`min-h-[44px] py-2 px-1 rounded-xl flex flex-col items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                          isSelected
                            ? 'bg-slate-800/90 ring-1 ring-slate-600'
                            : 'hover:bg-slate-900/90'
                        }`}
                      >
                        <span
                          className={`font-mono-num text-[11px] font-bold leading-none ${
                            allDone
                              ? 'text-emerald-400'
                              : hasMissions
                                ? 'text-cyan-400'
                                : day.played
                                  ? 'text-amber-400'
                                  : 'text-slate-500'
                          }`}
                        >
                          {day.missionsCompleted}
                        </span>

                        {/* 3-tier mission bar */}
                        <div className="w-full max-w-[24px] h-14 flex flex-col justify-end gap-1 p-1 rounded-lg bg-slate-900/95 border border-slate-800">
                          {tiers.map((tierNum) => {
                            const filled = day.missionsCompleted >= tierNum;
                            return (
                              <div
                                key={tierNum}
                                className={`flex-1 w-full rounded-[3px] transition-colors ${
                                  filled
                                    ? allDone
                                      ? 'bg-emerald-400'
                                      : 'bg-cyan-400'
                                    : 'bg-slate-800/80'
                                }`}
                              />
                            );
                          })}
                        </div>

                        <div className="flex flex-col items-center gap-0.5 leading-none">
                          <span
                            className={`text-[10px] font-medium whitespace-nowrap ${
                              day.isToday
                                ? 'text-white font-semibold'
                                : isSelected
                                  ? 'text-slate-200'
                                  : 'text-slate-400'
                            }`}
                          >
                            {day.weekdayLabel}
                          </span>
                          <span className="h-3 flex items-center justify-center">
                            {hasMissions ? (
                              <CheckCircle2
                                className={`w-3 h-3 ${
                                  allDone ? 'text-emerald-400' : 'text-cyan-400'
                                }`}
                                aria-hidden="true"
                              />
                            ) : day.played ? (
                              <Flame
                                className="w-3 h-3 text-amber-400"
                                aria-hidden="true"
                              />
                            ) : (
                              <span
                                className="text-[10px] text-slate-600 font-mono-num"
                                aria-hidden="true"
                              >
                                —
                              </span>
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedDay && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800/70 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-300 font-medium">
                      {selectedDay.shortDateLabel}
                      {selectedDay.isToday ? ' (Today)' : ` · ${selectedDay.weekdayLabel}`}
                    </span>
                    <span className="font-mono-num text-slate-400">
                      {selectedDay.missionsCompleted}/{selectedDay.missionsTarget} missions
                      {selectedDay.runsCount > 0
                        ? ` · ${selectedDay.runsCount} ${selectedDay.runsCount === 1 ? 'run' : 'runs'}`
                        : selectedDay.played
                          ? ' · Played'
                          : ' · Inactive'}
                    </span>
                  </div>
                )}
              </div>

              {/* Lifetime Career Totals */}
              <div className="pb-4 border-b border-slate-800 grid grid-cols-4 gap-2 text-center">
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    Best Score
                  </span>
                  <span className="font-mono-num text-base font-bold text-cyan-400 mt-0.5 block">
                    {combinedBestScore.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    Best Turn
                  </span>
                  <span className="font-mono-num text-base font-bold text-white mt-0.5 block">
                    {combinedBestTurn}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    Blocks Broken
                  </span>
                  <span className="font-mono-num text-base font-bold text-slate-200 mt-0.5 block">
                    {playerProgress.totalBlocksDestroyed.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    Max Chain
                  </span>
                  <span className="font-mono-num text-base font-bold text-amber-400 mt-0.5 block">
                    {playerProgress.highestChain >= 2
                      ? `×${playerProgress.highestChain}`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Saved Previous Plays */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-400">
                    Previous Plays
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono-num">
                    Auto-saved locally{userEmail ? ' & cloud' : ''}
                  </span>
                </div>

                {displayRuns.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center border border-slate-800 rounded-xl bg-slate-900/40">
                    Complete a run to save your score history and build your
                    daily streak.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
                    {displayRuns.map((run) => (
                      <div
                        key={run.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-mono-num text-xs text-slate-200">
                            {run.difficultyLabel ? `${run.difficultyLabel} · ` : ''}
                            Turn {run.turn} · {run.maxBalls} Balls
                            {run.peakChain >= 2 ? ` · ×${run.peakChain} Chain` : ''}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {formatRunDate(run.dateStr)}
                          </p>
                        </div>

                        <span className="font-mono-num font-bold text-cyan-400 shrink-0">
                          {run.score.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* #1 Global Top Score Champion Spotlight */}
              {topScore ? (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-400/35 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <Crown className="w-4 h-4 shrink-0" />
                      <span>#1 Top Score</span>
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-400">
                      {totalPlayers} {totalPlayers === 1 ? 'Player' : 'Players'} Ranked
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-white truncate">
                        {topScore.playerName}
                        {topScore.isYou ? (
                          <span className="text-xs font-semibold text-cyan-400 ml-1.5">
                            · You
                          </span>
                        ) : null}
                      </p>
                      <p className="font-mono-num text-[11px] text-slate-400 mt-0.5">
                        Turn {topScore.turn} · {topScore.maxBalls} Max Balls
                      </p>
                    </div>
                    <span className="font-mono-num text-2xl font-bold text-amber-300 shrink-0">
                      {topScore.score.toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 pt-1.5 border-t border-slate-800/80 font-mono-num">
                    {topScore.isYou
                      ? 'You hold the #1 global high score.'
                      : combinedBestScore > 0 && topScore.score > combinedBestScore
                        ? `${(topScore.score - combinedBestScore).toLocaleString()} pts behind #1 (Your Best: ${combinedBestScore.toLocaleString()})`
                        : `Beat ${topScore.score.toLocaleString()} to claim #1.`}
                  </p>
                </div>
              ) : null}

              {/* Player Callsign & Personal Global Rank */}
              <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block">
                      Your Leaderboard Name
                    </span>
                    {!editingName && (
                      <p className="text-sm font-semibold text-white truncate mt-0.5">
                        {playerName}
                      </p>
                    )}
                  </div>

                  {!editingName && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(playerName);
                        setEditingName(true);
                      }}
                      className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                      <span>Edit Name</span>
                    </button>
                  )}
                </div>

                {editingName && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const clean = draftName.trim();
                      if (!clean) return;
                      await onSavePlayerName(clean);
                      setEditingName(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      maxLength={20}
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Enter callsign..."
                      aria-label="Player callsign"
                      className="flex-1 min-w-0 h-9 px-2.5 rounded-lg bg-[#0b1120] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      disabled={savingPlayerName || !draftName.trim()}
                      className="h-9 px-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      {savingPlayerName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Cancel
                    </button>
                  </form>
                )}

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs font-mono-num">
                  <span className="text-slate-400">
                    Global Rank:{' '}
                    <strong className="text-cyan-300">
                      {myRank ? `#${myRank.rank} of ${totalPlayers}` : 'Unranked'}
                    </strong>
                  </span>
                  <span className="text-slate-300">
                    Best{' '}
                    <strong>
                      {(myRank?.score ?? combinedBestScore).toLocaleString()}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Global Top Players Rankings */}
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-400">
                    Global Top Players
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono-num">
                    Best score per player
                  </span>
                </div>

                {loading ? (
                  <p className="text-sm text-slate-400 py-6 text-center">
                    Loading rankings...
                  </p>
                ) : error ? (
                  <p className="text-sm text-rose-400 py-4 text-center">
                    {error}
                  </p>
                ) : entries.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center border border-slate-800 rounded-xl bg-slate-900/40">
                    No runs recorded yet. Finish a game to post the first Top Score.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
                    {entries.map((entry, idx) => {
                      const rankNum = entry.rank ?? idx + 1;
                      return (
                        <div
                          key={entry.id}
                          className={`px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${
                            entry.isYou ? 'bg-cyan-500/8' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`font-mono-num w-7 text-xs font-bold shrink-0 ${
                                rankNum === 1
                                  ? 'text-amber-300'
                                  : rankNum === 2
                                    ? 'text-slate-200'
                                    : rankNum === 3
                                      ? 'text-orange-400'
                                      : 'text-slate-500'
                              }`}
                            >
                              #{rankNum}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-100 truncate">
                                {entry.playerName}
                                {entry.isYou ? (
                                  <span className="text-[11px] font-semibold text-cyan-400 ml-1.5">
                                    · You
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono-num">
                                Turn {entry.turn} · {entry.maxBalls} Max Balls
                              </p>
                            </div>
                          </div>

                          <span
                            className={`font-mono-num font-bold shrink-0 ${
                              rankNum === 1 ? 'text-amber-300' : 'text-cyan-400'
                            }`}
                          >
                            {entry.score.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional Cloud Account Sync */}
              {userEmail ? (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {userName || userEmail.split('@')[0]}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      Synced via Google · {userEmail}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onSignOut}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Cross-Device Cloud Sync
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Scores already post globally. Sign in with Google to sync
                      stats across devices.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Sign In</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
