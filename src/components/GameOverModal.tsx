import { RotateCcw, Target, Trophy } from 'lucide-react';

interface GameOverModalProps {
  score: number;
  bestScore: number;
  turn: number;
  powerupsCollected: number;
  dailyMultiplier: number;
  missionsCompleted: number;
  missionsTotal: number;
  playStreak: number;
  isNewBest: boolean;
  cloudSaved: boolean;
  onPlayAgain: () => void;
  onOpenLeaderboard: () => void;
  onOpenMissions: () => void;
}

const GAME_LOGO_URL = '/src/assets/images/prism_sling_logo_1794866373917.jpg';

export function GameOverModal({
  score,
  bestScore,
  turn,
  powerupsCollected,
  dailyMultiplier,
  missionsCompleted,
  missionsTotal,
  playStreak,
  isNewBest,
  cloudSaved,
  onPlayAgain,
  onOpenLeaderboard,
  onOpenMissions,
}: GameOverModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-2d-title"
      className="absolute inset-0 z-20 flex items-center justify-center p-5 bg-[#070b14]/88"
    >
      <div className="w-full max-w-[340px] rounded-2xl bg-[#0b1120] border border-slate-700/85 p-6 text-center shadow-2xl">
        <div className="w-14 h-14 mx-auto mb-3 rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900 shadow-lg">
          <img
            src={GAME_LOGO_URL}
            alt="Prism Sling thumbnail"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-[1.12]"
          />
        </div>

        <p className="text-xs font-medium text-rose-400">
          {isNewBest ? 'New High Score' : 'Arena Breached'}
        </p>

        <h2
          id="gameover-2d-title"
          className="font-display text-2xl font-bold text-white mt-1"
        >
          Game Over
        </h2>

        <div className="mt-4 py-4 border-y border-slate-800 grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-slate-400 block">Final Score</span>
            <span className="font-mono-num text-2xl font-bold text-cyan-400 mt-0.5 block">
              {score.toLocaleString()}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">Best Score</span>
            <span className="font-mono-num text-2xl font-bold text-white mt-0.5 block">
              {bestScore.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-400 font-mono-num">
          Turn {turn} · {powerupsCollected} Power-Ups
          {playStreak > 0 ? ` · ${playStreak}d Streak` : ''}
          {dailyMultiplier > 1 ? ` · ${dailyMultiplier.toFixed(2)}×` : ''}
          {cloudSaved ? ' · Saved' : ''}
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>Play Again</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onOpenMissions}
              className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Target className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Missions {missionsCompleted}/{missionsTotal}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Stats &amp; Ranks</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

