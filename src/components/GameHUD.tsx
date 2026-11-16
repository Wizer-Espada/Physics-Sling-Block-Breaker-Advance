import { RotateCcw, Shield, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface GameHUDProps {
  score: number;
  bestScore: number;
  turn: number;
  difficultyTier: number;
  ballCount: number;
  pendingExtraBalls: number;
  shields: number;
  dailyMultiplier: number;
  muted: boolean;
  onToggleMute: () => void;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
}

export function GameHUD({
  score,
  bestScore,
  turn,
  difficultyTier,
  ballCount,
  pendingExtraBalls,
  shields,
  dailyMultiplier,
  muted,
  onToggleMute,
  onRestart,
  onOpenLeaderboard,
}: GameHUDProps) {
  return (
    <header className="shrink-0 w-full px-2 sm:px-3 py-2 bg-[#0b1120] border-b border-slate-800/90 flex items-center justify-between gap-1.5 sm:gap-2">
      {/* Left compact score & turn readouts (unboxed, tabular-nums) */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        <div>
          <span className="text-[10px] font-medium text-slate-400 block leading-none">
            Score
          </span>
          <span className="font-mono-num text-base sm:text-lg font-bold text-white leading-tight">
            {score.toLocaleString()}
            {dailyMultiplier > 1 ? (
              <span className="text-emerald-400 text-[11px] font-bold ml-1">
                {dailyMultiplier.toFixed(2)}×
              </span>
            ) : null}
          </span>
        </div>

        <div className="h-6 w-px bg-slate-800 shrink-0" aria-hidden="true" />

        <div>
          <span className="text-[10px] font-medium text-slate-400 block leading-none">
            Turn
          </span>
          <span className="font-mono-num text-sm sm:text-base font-bold text-cyan-400 leading-tight">
            {turn}
            {difficultyTier > 1 ? (
              <span className="text-amber-400 text-xs ml-1">
                T{difficultyTier}
              </span>
            ) : null}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-medium text-slate-400 block leading-none">
            Balls
          </span>
          <span className="font-mono-num text-sm sm:text-base font-bold text-slate-100 leading-tight">
            {ballCount}
            {pendingExtraBalls > 0 ? (
              <span className="text-emerald-400 text-xs ml-0.5">
                +{pendingExtraBalls}
              </span>
            ) : null}
          </span>
        </div>

        <div>
          <span className="text-[10px] font-medium text-slate-400 block leading-none">
            Shield
          </span>
          <span
            className={`font-mono-num text-sm sm:text-base font-bold leading-tight inline-flex items-center gap-1 ${
              shields > 0 ? 'text-sky-300' : 'text-slate-500'
            }`}
          >
            {shields > 0 ? (
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            )}
            <span>{shields}</span>
          </span>
        </div>

        <div className="hidden sm:block">
          <span className="text-[10px] font-medium text-slate-400 block leading-none">
            Best
          </span>
          <span className="font-mono-num text-sm sm:text-base font-bold text-slate-300 leading-tight">
            {bestScore.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Right utility actions (>= 44px touch targets) */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
        <PWAInstallButton />

        <button
          type="button"
          onClick={onOpenLeaderboard}
          aria-label="Leaderboard"
          title="Leaderboard"
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
          {muted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>

        <button
          type="button"
          onClick={onRestart}
          aria-label="Restart game"
          title="Restart"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
