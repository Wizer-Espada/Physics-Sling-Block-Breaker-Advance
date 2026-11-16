export interface BlockColorPalette {
  fill: string;
  stroke: string;
  glow: string;
  text: string;
}

export function getBlockColors(hp: number): BlockColorPalette {
  const clamped = Math.max(1, hp);
  // Smooth neon hue progression across tiers: cyan -> emerald -> amber -> coral -> rose -> violet
  const hue = (192 - Math.log2(clamped) * 34 + 360) % 360;
  return {
    fill: `hsla(${hue.toFixed(0)}, 86%, 54%, 0.2)`,
    stroke: `hsl(${hue.toFixed(0)}, 92%, 62%)`,
    glow: `hsla(${hue.toFixed(0)}, 95%, 60%, 0.45)`,
    text: '#f8fafc',
  };
}

export function getChainMultiplierColor(multiplier: number): string {
  if (multiplier >= 8) return '#f472b6'; // Hot Magenta / Rose
  if (multiplier >= 6) return '#fbbf24'; // Solar Gold
  if (multiplier >= 4) return '#34d399'; // Emerald Surge
  return '#38bdf8'; // Electric Cyan (2x-3x)
}

