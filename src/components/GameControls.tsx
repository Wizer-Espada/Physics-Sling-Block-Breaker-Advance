import { ArrowDownToLine, FastForward, Target } from 'lucide-react';
import { GamePhase } from '../game/types.ts';

interface GameControlsProps {
  phase: GamePhase;
  fastForward: boolean;
  isAiming: boolean;
  isAimValid: boolean;
  aimAngleDeg: number;
  bestScore: number;
  missionsCompleted: number;
  missionsTotal: number;
  dailyMultiplier: number;
  onToggleFastForward: () => void;
  onRecallBalls: () => void;
  onOpenMissions: () => void;
}

export function GameControls({
  phase,
  fastForward,
  isAiming,
  isAimValid,
  aimAngleDeg,
  bestScore,
  missionsCompleted,
  missionsTotal,
  dailyMultiplier,
  onToggleFastForward,
  onRecallBalls,
  onOpenMissions,
}: GameControlsProps) {
  const inFlight = phase === 'FIRING' || phase === 'FLYING';

  return (
    <footer className="shrink-0 w-full h-[60px] px-3 bg-[#0b1120] border-t border-slate-800/90 flex items-center justify-between gap-2">
      {inFlight ? (
        <div className="w-full grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onToggleFastForward}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border transition-colors active:scale-[0.98] whitespace-nowrap ${
              fastForward
                ? 'bg-amber-500 border-amber-400 text-slate-950'
                : 'bg-slate-800/90 border-slate-700 text-slate-100 hover:bg-slate-700'
            }`}
          >
            <FastForward className="w-4 h-4 shrink-0" />
            <span>{fastForward ? '2x Speed On' : 'Fast Forward (2x)'}</span>
          </button>

          <button
            type="button"
            onClick={onRecallBalls}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap"
          >
            <ArrowDownToLine className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Recall Balls</span>
          </button>
        </div>
      ) : (
        <div className="w-full flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenMissions}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800/85 hover:bg-slate-700/85 border border-slate-700/80 text-slate-100 text-xs font-semibold flex items-center gap-2 transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
          >
            <Target className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Quests</span>
            <span className="font-mono-num text-slate-400">
              {missionsCompleted}/{missionsTotal}
            </span>
          </button>

          <div className="text-right min-w-0">
            {isAiming && isAimValid ? (
              <span className="font-mono-num text-xs text-cyan-300 truncate block">
                Angle {aimAngleDeg}°
              </span>
            ) : (
              <span className="font-mono-num text-xs text-slate-400 truncate block">
                {dailyMultiplier > 1 && (
                  <span className="text-emerald-400 font-semibold mr-2">
                    {dailyMultiplier.toFixed(2)}× Bonus
                  </span>
                )}
                Best {bestScore.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}

