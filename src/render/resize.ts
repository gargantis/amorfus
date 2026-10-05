// D-26/§8.4: the internal render resolution is always capped; tiers set
// the cap, MSAA, view radius and anisotropy. Tier changes are manual in
// the MVP.

export interface Tier {
  pixelCapMP: number;
  msaa: 1 | 4;
  viewRadius: number;
  anisotropy: number;
}

export const TIERS: Record<'low' | 'medium' | 'high', Tier> = {
  low: { pixelCapMP: 1.2, msaa: 1, viewRadius: 128, anisotropy: 1 },
  // Medium's radius: 160 or 192, chosen at M2 on the D-1 device (C-19);
  // 160 while the fallback device applies.
  medium: { pixelCapMP: 2.1, msaa: 4, viewRadius: 160, anisotropy: 4 },
  high: { pixelCapMP: 3.7, msaa: 4, viewRadius: 256, anisotropy: 8 },
};

export interface CanvasSize {
  width: number;
  height: number;
  scale: number;
}

export function computeCanvasSize(args: {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  pixelCapMP: number;
}): CanvasSize {
  const { cssWidth, cssHeight, dpr, pixelCapMP } = args;
  const cssArea = Math.max(1, cssWidth * cssHeight);
  const capPx = pixelCapMP * 1e6;
  const scale = Math.min(dpr, Math.sqrt(capPx / cssArea));
  return {
    width: Math.max(1, Math.round(cssWidth * scale)),
    height: Math.max(1, Math.round(cssHeight * scale)),
    scale,
  };
}
