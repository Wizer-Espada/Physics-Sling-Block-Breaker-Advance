import { useEffect, useState } from 'react';
import { Home, RotateCcw, Shield, ShieldCheck, Trophy, Volume2, VolumeX } from 'lucide-react';
import { DifficultyMode, DIFFICULTY_CONFIGS } from '../game/types.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface ComboChainTier {
  name: string;
  minHits: number;
  nextHits: number | null;
  nextName: string | null;
  textClass: string;
  barClass: string;
}

function getComboChainTier(hits: number): ComboChainTier {
  if (hits >= 12) {
    return {
      name: 'Prism-tastic!',
      minHits: 12,
      nextHits: null,
      nextName: null,
      textClass: 'text-pink-300',
      barClass: 'bg-gradient-to-r from-amber-400 via-orange-400 to-pink-400',
    };
  }
  if (hits >= 9) {
    return {
      name: 'Super!',
      minHits: 9,
      nextHits: 12,
      nextName: 'Prism-tastic',
      textClass: 'text-orange-300',
      barClass: 'bg-gradient-to-r from-amber-400 to-orange-400',
    };
  }
  if (hits >= 6) {
    return {
      name: 'Awesome!',
      minHits: 6,
      nextHits: 9,
      nextName: 'Super',
      textClass: 'text-amber-300',
      barClass: 'bg-gradient-to-r from-emerald-400 to-amber-400',
    };
  }
  if (hits >= 4) {
    return {
      name: 'Nice!',
      minHits: 4,
      nextHits: 6,
      nextName: 'Awesome',
      textClass: 'text-emerald-300',
      barClass: 'bg-gradient-to-r from-sky-400 to-emerald-400',
    };
  }
  return {
    name: 'Chain',
    minHits: 2,
    nextHits: 4,
    nextName: 'Nice',
    textClass: 'text-sky-300',
    barClass: 'bg-sky-400',
  };
}

interface GameHUDProps {
  score: number;
  bestScore: number;
  turn: number;
  difficultyMode: DifficultyMode;
  difficultyTier: number;
  stageSpeedMult: number;
  ballCount: number;
  pendingExtraBalls: number;
  shields: number;
  dailyMultiplier: number;
  trajectoryCombo: number;
  trajectoryComboBump: number;
  muted: boolean;
  onGoHome: () => void;
  onToggleMute: () => void;
  onRestart: () => void;
  onOpenLeaderboard: () => void;
}

export function GameHUD({
  score,
  bestScore,
  turn,
  difficultyMode,
  difficultyTier,
  stageSpeedMult,
  ballCount,
  pendingExtraBalls,
  shields,
  dailyMultiplier,
  trajectoryCombo,
  trajectoryComboBump,
  muted,
  onGoHome,
  onToggleMute,
  onRestart,
  onOpenLeaderboard,
}: GameHUDProps) {
  const [lastVisibleCombo, setLastVisibleCombo] = useState<number>(2);
  const [comboPop, setComboPop] = useState<boolean>(false);

  const isComboActive = trajectoryCombo >= 2;

  useEffect(() => {
    if (trajectoryCombo >= 2) {
      setLastVisibleCombo(trajectoryCombo);
    }
  }, [trajectoryCombo]);

  useEffect(() => {
    if (trajectoryCombo < 2 || trajectoryComboBump <= 0) return;
    setComboPop(true);
    const timer = window.setTimeout(() => {
      setComboPop(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [trajectoryCombo, trajectoryComboBump]);

  const shownCombo = isComboActive ? trajectoryCombo : lastVisibleCombo;
  const comboTier = getComboChainTier(shownCombo);
  const growthScale = Math.min(1.38, 1 + Math.max(0, shownCombo - 2) * 0.038);
  const effectiveScale = isComboActive
    ? Number((growthScale + (comboPop ? 0.13 : 0)).toFixed(3))
    : 0.82;
  const chainProgress = Math.min(1, Math.max(0.08, (shownCombo - 1) / 11));

  const modeShort =
    difficultyMode === 'overdrive'
      ? 'OD'
      : difficultyMode === 'relaxed'
        ? 'RLX'
        : '';
  // Stages escalate at turn 5, 10, 15, ...
  const stageProgressPct =
    turn < 5 ? Math.round((turn / 4) * 100) : Math.round((((turn % 5) + 1) / 5) * 100);

  return (
    <header className="relative z-10 shrink-0 w-full px-2 sm:px-3 py-2 bg-[#0b1120] border-b border-slate-800/90 flex items-center justify-between gap-1.5 sm:gap-2">
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
            {modeShort ? `Turn · ${DIFFICULTY_CONFIGS[difficultyMode].label}` : 'Turn'}
          </span>
          <span className="font-mono-num text-sm sm:text-base font-bold text-cyan-400 leading-tight whitespace-nowrap">
            {turn}
            <span
              className={`text-xs ml-1 ${
                difficultyTier >= 4
                  ? 'text-amber-400'
                  : difficultyTier >= 2
                    ? 'text-sky-300'
                    : 'text-slate-400'
              }`}
              title={`Stage ${difficultyTier} (${stageSpeedMult.toFixed(2)}× ball speed)`}
            >
              S{difficultyTier}
              {stageSpeedMult > 1 ? `·${stageSpeedMult.toFixed(2).replace(/\.?0+$/, '')}×` : ''}
            </span>
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
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Home menu"
          title="Home"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-cyan-300 hover:bg-slate-800/80 active:scale-95 transition-colors"
        >
          <Home className="w-4 h-4" />
        </button>

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

      {/* Subtle hairline stage progress indicator along header bottom */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] bg-slate-900"
      >
        <div
          className={`h-full transition-[width] duration-300 ${
            difficultyTier >= 4
              ? 'bg-amber-400/80'
              : difficultyTier >= 2
                ? 'bg-sky-400/80'
                : 'bg-cyan-400/65'
          }`}
          style={{ width: `${stageProgressPct}%` }}
        />
      </div>

      {/* Text-overlay COMBO label that appears and grows along a single ball trajectory */}
      <div
        aria-live="polite"
        aria-hidden={!isComboActive}
        className={`pointer-events-none absolute top-full inset-x-0 mx-auto w-fit mt-1.5 z-20 flex flex-col items-center origin-top transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          isComboActive ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          transform: `scale(${effectiveScale})`,
        }}
      >
        <div className="flex items-baseline gap-1.5 whitespace-nowrap drop-shadow-[0_2px_8px_rgba(7,11,20,0.98)]">
          <span className="font-display text-[11px] font-extrabold tracking-[0.14em] uppercase text-slate-100">
            COMBO
          </span>
          <span
            className={`font-mono-num text-base font-extrabold leading-none ${comboTier.textClass}`}
          >
            ×{shownCombo}
          </span>
        </div>

        {/* Visual trajectory chain progress bar with tier ticks */}
        <div className="relative mt-0.5 w-28 h-1 rounded-full bg-slate-950/85 overflow-hidden shadow-[0_1px_4px_rgba(7,11,20,0.9)]">
          <div
            className={`h-full w-full origin-left transition-transform duration-150 ease-out motion-reduce:transition-none ${comboTier.barClass}`}
            style={{ transform: `scaleX(${chainProgress})` }}
          />
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-[27%] w-px bg-slate-950/70"
          />
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-[45%] w-px bg-slate-950/70"
          />
          <span
            aria-hidden="true"
            className="absolute top-0 bottom-0 left-[73%] w-px bg-slate-950/70"
          />
        </div>

        <span className="mt-0.5 font-mono-num text-[10px] font-semibold text-slate-300 whitespace-nowrap drop-shadow-[0_1px_4px_rgba(7,11,20,0.98)]">
          {comboTier.nextHits !== null
            ? `${comboTier.name} · ${comboTier.nextHits - shownCombo} to ${comboTier.nextName}`
            : `${comboTier.name} · Max Chain`}
        </span>
      </div>
    </header>
  );
}
