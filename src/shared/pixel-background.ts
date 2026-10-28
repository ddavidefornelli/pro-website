// Fixed artwork coordinates: twice the original density on each axis.
export const PIXEL_COLUMNS = 160;
export const PIXEL_ROWS = 80;
export const PIXEL_SIZE = 10;
export const PIXEL_WIDTH = PIXEL_COLUMNS * PIXEL_SIZE;
export const PIXEL_HEIGHT = PIXEL_ROWS * PIXEL_SIZE;
export const PIXEL_FRAME_INTERVAL = 100;
export const PIXEL_REVEAL_DURATION = 1800;

export interface PixelCell {
  x: number;
  y: number;
  tier: number;
  delay: number;
  duration: number;
  phase: number;
  intensity: number;
}

const clusters = [
  { x: 0.34, y: 0.35, radius: 0.15 },
  { x: 0.57, y: 0.61, radius: 0.19 },
  { x: 0.69, y: 0.3, radius: 0.12 },
  { x: 0.42, y: 0.76, radius: 0.13 },
];

function noise(x: number, y: number): number {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function createPixelCells(): PixelCell[] {
  return Array.from({ length: PIXEL_COLUMNS * PIXEL_ROWS }, (_, index) => {
    const x = index % PIXEL_COLUMNS;
    const y = Math.floor(index / PIXEL_COLUMNS);
    let strength = 0;
    for (const cluster of clusters) {
      const distance = Math.hypot(
        (x / PIXEL_COLUMNS - cluster.x) * 1.6,
        y / PIXEL_ROWS - cluster.y,
      );
      strength = Math.max(strength, 1 - distance / cluster.radius);
    }
    const chance = noise(x, y);
    // Light a substantial share of the whole artwork at each early level.
    // Clusters bias the reveal, rather than leaving nearly everything dark.
    const tier =
      chance < 0.32 + strength * 0.3
        ? 1
        : chance < 0.68 + strength * 0.22
          ? 2
          : 3;
    const duration = Math.round(60000 + noise(x + 173, y) * 80000);
    return {
      x: x * PIXEL_SIZE + 1,
      y: y * PIXEL_SIZE + 1,
      tier,
      delay: Math.round(noise(y + 91, x) * 1800),
      duration,
      // Start throughout the cycle so cells never charge in unison.
      phase: Math.round(noise(y + 317, x) * duration),
      intensity: 0.35 + noise(x + 571, y + 23) * 0.65,
    };
  });
}

function ease(value: number): number {
  return value * value * (3 - 2 * value);
}

// Quantized alpha lets the renderer skip cells whose visible brightness hasn't
// changed. A very slow, eased rise/hold/decay avoids abrupt flashes or flicker.
export function pixelAlpha(
  cell: PixelCell,
  elapsed: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return Math.round(cell.intensity * 255);
  const reveal = ease(
    Math.min(1, Math.max(0, (elapsed - cell.delay) / PIXEL_REVEAL_DURATION)),
  );
  if (reveal === 0) return 0;
  const progress = ((elapsed + cell.phase) % cell.duration) / cell.duration;
  const ramp =
    progress < 0.54
      ? progress / 0.54
      : progress < 0.65
        ? 1
        : (1 - progress) / 0.35;
  const charge = 0.12 + 0.88 * ease(ramp);
  return Math.round(cell.intensity * charge * reveal * 255);
}
