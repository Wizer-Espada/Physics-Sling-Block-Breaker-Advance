import { useRef } from 'react';
import { Music2, RotateCcw, Volume2, VolumeX, Waves, Zap } from 'lucide-react';
import {
  AudioChannel,
  AudioVolumeSettings,
  DEFAULT_AUDIO_VOLUMES,
} from '../game/audio.ts';

interface AudioSettingsPanelProps {
  volumes: AudioVolumeSettings;
  muted: boolean;
  onChangeVolume: (channel: AudioChannel, value: number) => void;
  onToggleMute: () => void;
  onResetVolumes: () => void;
  onTestSfx?: () => void;
}

interface ChannelMeta {
  id: AudioChannel;
  label: string;
  description: string;
  accentHex: string;
  textClass: string;
}

const CHANNELS: ChannelMeta[] = [
  {
    id: 'music',
    label: 'Music',
    description: 'Lo-fi bassline & Rhodes melody loop',
    accentHex: '#38bdf8',
    textClass: 'text-cyan-400',
  },
  {
    id: 'sfx',
    label: 'SFX',
    description: 'Brick hits, explosions, shields & pickups',
    accentHex: '#34d399',
    textClass: 'text-emerald-400',
  },
  {
    id: 'ambient',
    label: 'Ambient',
    description: 'Warm synth pads & atmospheric air bed',
    accentHex: '#818cf8',
    textClass: 'text-indigo-400',
  },
];

export function AudioSettingsPanel({
  volumes,
  muted,
  onChangeVolume,
  onToggleMute,
  onResetVolumes,
  onTestSfx,
}: AudioSettingsPanelProps) {
  const prevNonZeroRef = useRef<AudioVolumeSettings>({ ...DEFAULT_AUDIO_VOLUMES });

  const handleToggleChannelMute = (channel: AudioChannel) => {
    const current = volumes[channel];
    if (current > 0.001) {
      prevNonZeroRef.current[channel] = current;
      onChangeVolume(channel, 0);
    } else {
      const restore = prevNonZeroRef.current[channel] || DEFAULT_AUDIO_VOLUMES[channel];
      onChangeVolume(channel, restore);
      if (channel === 'sfx' && !muted) {
        onTestSfx?.();
      }
    }
  };

  const isDefault =
    Math.abs(volumes.music - DEFAULT_AUDIO_VOLUMES.music) < 0.01 &&
    Math.abs(volumes.sfx - DEFAULT_AUDIO_VOLUMES.sfx) < 0.01 &&
    Math.abs(volumes.ambient - DEFAULT_AUDIO_VOLUMES.ambient) < 0.01;

  return (
    <div className="space-y-4">
      {/* Master Output Row */}
      <div className="pb-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            Master Audio Output
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {muted
              ? 'All game sound is muted. Unmute to preview changes.'
              : 'Mix Music, SFX, and Ambient levels independently.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
            muted
              ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
              : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
          }`}
        >
          {muted ? (
            <>
              <VolumeX className="w-3.5 h-3.5 shrink-0" />
              <span>Unmute</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Mute All</span>
            </>
          )}
        </button>
      </div>

      {/* Independent Channel Sliders */}
      <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60">
        {CHANNELS.map((channel) => {
          const val = volumes[channel.id];
          const pct = Math.round(val * 100);
          const channelMuted = val <= 0.001;
          const sliderBg = `linear-gradient(to right, ${
            muted ? '#475569' : channel.accentHex
          } ${pct}%, #1e293b ${pct}%)`;

          return (
            <div key={channel.id} className="px-4 py-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => handleToggleChannelMute(channel.id)}
                    aria-label={
                      channelMuted
                        ? `Unmute ${channel.label}`
                        : `Mute ${channel.label}`
                    }
                    title={
                      channelMuted
                        ? `Restore ${channel.label}`
                        : `Mute ${channel.label}`
                    }
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 flex items-center justify-center transition-colors shrink-0"
                  >
                    {channelMuted ? (
                      <VolumeX className="w-4 h-4 text-slate-500" />
                    ) : channel.id === 'music' ? (
                      <Music2 className={`w-4 h-4 ${channel.textClass}`} />
                    ) : channel.id === 'sfx' ? (
                      <Zap className={`w-4 h-4 ${channel.textClass}`} />
                    ) : (
                      <Waves className={`w-4 h-4 ${channel.textClass}`} />
                    )}
                  </button>

                  <div className="min-w-0">
                    <label
                      htmlFor={`audio-slider-${channel.id}`}
                      className="text-sm font-semibold text-white leading-tight block"
                    >
                      {channel.label}
                    </label>
                    <p className="text-xs text-slate-400 truncate">
                      {channel.description}
                    </p>
                  </div>
                </div>

                <span
                  className={`font-mono-num text-sm font-bold shrink-0 ${
                    muted || channelMuted ? 'text-slate-500' : channel.textClass
                  }`}
                >
                  {pct}%
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id={`audio-slider-${channel.id}`}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pct}
                  aria-label={`${channel.label} volume`}
                  onChange={(e) => {
                    const next = Number(e.target.value) / 100;
                    if (next > 0.001) {
                      prevNonZeroRef.current[channel.id] = next;
                    }
                    onChangeVolume(channel.id, next);
                  }}
                  onPointerUp={() => {
                    if (channel.id === 'sfx' && !muted && val > 0.001) {
                      onTestSfx?.();
                    }
                  }}
                  onKeyUp={() => {
                    if (channel.id === 'sfx' && !muted && val > 0.001) {
                      onTestSfx?.();
                    }
                  }}
                  style={{ background: sliderBg }}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-xs text-slate-400">
          Settings save automatically on this device.
        </p>

        <button
          type="button"
          onClick={onResetVolumes}
          disabled={isDefault}
          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-45 disabled:pointer-events-none border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>Reset Mix</span>
        </button>
      </div>
    </div>
  );
}
