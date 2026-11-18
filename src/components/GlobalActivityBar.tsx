import { useEffect, useRef, useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';

export interface GlobalActivityEntry {
  id: number;
  playerName: string;
  score: number;
  turn: number;
  maxBalls: number;
  createdAt: string;
}

interface GlobalActivityBarProps {
  entries: GlobalActivityEntry[];
  loading: boolean;
  error: string | null;
  userBestScore: number;
  onOpenRankings: () => void;
  onRefresh: () => void;
}

function formatRelativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}

export function GlobalActivityBar({
  entries,
  loading,
  error,
  userBestScore,
  onOpenRankings,
  onRefresh,
}: GlobalActivityBarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState<boolean>(false);

  // Gentle auto-scroll across global scores when overflowing; pauses on hover, touch, focus, or reduced-motion
  useEffect(() => {
    if (paused || entries.length <= 1) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    let rafId = 0;
    let lastTs = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll > 8) {
        carry += dt * 24;
        if (carry >= 1) {
          const step = Math.floor(carry);
          carry -= step;
          if (el.scrollLeft + step >= maxScroll) {
            el.scrollLeft = 0;
          } else {
            el.scrollLeft += step;
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [entries.length, paused]);

  return (
    <section
      aria-label="Global player activity"
      className="shrink-0 bg-[#080d1a] border-t border-slate-800/90 px-4 py-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
          <h2 className="text-[11px] font-semibold text-slate-300 whitespace-nowrap">
            Global Activity
          </h2>
          {entries.length > 0 && (
            <span className="font-mono-num text-[11px] text-slate-500 whitespace-nowrap">
              · {entries.length} live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh global activity"
            title="Refresh"
            className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded text-slate-400 hover:text-cyan-300 transition-colors"
          >
            <RefreshCw
              className={`w-3 h-3 ${loading ? 'animate-spin text-cyan-400' : ''}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={onOpenRankings}
            className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 whitespace-nowrap transition-colors"
          >
            All Ranks
          </button>
        </div>
      </div>

      {error && entries.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-1 truncate">
          Offline · Global score stream unavailable
        </p>
      ) : loading && entries.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-1 truncate">
          Fetching real-time scores from other players...
        </p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-1 truncate">
          No recent runs from other players yet — finish a game or share to compete.
        </p>
      ) : (
        <div
          ref={scrollRef}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="flex items-center gap-3 overflow-x-auto pb-0.5 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]"
        >
          {entries.map((entry, idx) => {
            const beatsUser = userBestScore > 0 && entry.score > userBestScore;
            const relTime = formatRelativeTime(entry.createdAt);

            return (
              <button
                key={entry.id}
                type="button"
                onClick={onOpenRankings}
                className={`shrink-0 flex items-baseline gap-1.5 text-left whitespace-nowrap py-0.5 transition-colors hover:text-white ${
                  idx > 0 ? 'pl-3 border-l border-slate-800/90' : ''
                }`}
              >
                <span className="text-xs font-medium text-slate-200 max-w-[110px] truncate">
                  {entry.playerName}
                </span>
                <span
                  className={`font-mono-num text-xs font-bold ${
                    beatsUser ? 'text-amber-300' : 'text-cyan-300'
                  }`}
                >
                  {entry.score.toLocaleString()}
                </span>
                <span className="font-mono-num text-[11px] text-slate-500">
                  T{entry.turn}
                  {relTime ? ` · ${relTime}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
