import { useState } from 'react';
import { Flame, History, LogOut, Trophy, UserPlus, X } from 'lucide-react';
import {
  getEffectiveMissionStreak,
  getEffectivePlayStreak,
  PlayerProgressState,
} from '../game/progress.ts';

export interface LeaderboardEntry {
  id: number;
  playerName: string;
  score: number;
  turn: number;
  maxBalls: number;
  powerupsCollected: number;
  createdAt: string;
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
  profile: PlayerProfileSummary | null;
  playerProgress: PlayerProgressState;
  loading: boolean;
  error: string | null;
  userEmail: string | null;
  userName: string | null;
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
  profile,
  playerProgress,
  loading,
  error,
  userEmail,
  userName,
  onClose,
  onSignIn,
  onSignOut,
}: LeaderboardDrawerProps) {
  const [tab, setTab] = useState<'progress' | 'rankings'>('progress');

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
          dateStr: r.playedAt,
        }))
      : (profile?.recentRuns ?? []).map((r) => ({
          id: String(r.id),
          score: r.score,
          turn: r.turn,
          maxBalls: r.maxBalls,
          peakChain: 0,
          blocksDestroyed: 0,
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
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('progress')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'progress'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Streaks &amp; History</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('rankings')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                tab === 'rankings'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Leaderboard</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'progress' ? (
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
              {/* Player Cloud Profile Section */}
              {userEmail ? (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {userName || userEmail.split('@')[0]}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {userEmail}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={onSignOut}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>

                  {profile && (
                    <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Personal Best
                        </span>
                        <span className="font-mono-num text-lg font-bold text-cyan-400">
                          {profile.bestScore.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Best Turn
                        </span>
                        <span className="font-mono-num text-lg font-bold text-white">
                          {profile.bestTurn}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          Cloud Runs
                        </span>
                        <span className="font-mono-num text-lg font-bold text-slate-200">
                          {profile.totalRuns}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Sync Runs to Global Leaderboard
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Sign in with Google to back up runs and compete on global
                      rankings.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </button>
                </div>
              )}

              {/* Global Rankings */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 mb-2.5">
                  Top Arena Runs
                </h3>

                {loading ? (
                  <p className="text-sm text-slate-400 py-6 text-center">
                    Loading rankings...
                  </p>
                ) : error ? (
                  <p className="text-sm text-rose-400 py-4 text-center">
                    {error}
                  </p>
                ) : entries.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">
                    No runs recorded yet. Play a match and sign in to claim #1.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
                    {entries.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`font-mono-num w-6 text-xs font-bold ${
                              idx === 0
                                ? 'text-amber-400'
                                : idx === 1
                                  ? 'text-slate-300'
                                  : idx === 2
                                    ? 'text-orange-400'
                                    : 'text-slate-500'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-100 truncate">
                              {entry.playerName}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono-num">
                              Turn {entry.turn} · {entry.maxBalls} Max Balls
                            </p>
                          </div>
                        </div>

                        <span className="font-mono-num font-bold text-cyan-400 shrink-0">
                          {entry.score.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
