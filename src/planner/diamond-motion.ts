export type Diamond = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  cut: 0 | 1 | 2;
  light: number;
  lightRadius: number;
  reflection: number;
  reflectionAt: number;
  reflectionDuration: number;
  reflectionVariant: 0 | 1;
  releaseAt: number;
  duration: number;
  angle: number;
};

function initializeFlight(gem: Diamond, width: number, column: number, columns: number, random: () => number): void {
  // Fill every part of the width, with timing independent of column order.
  // Edge gems may be partially cropped, so the shower feels full-bleed.
  gem.x = (column + .08 + random() * .84) / columns * width;
  gem.y = -gem.size;
  gem.duration = 3.4 + random() * 1.6;
  // Keep the point facing down. The orientation never changes during a fall.
  gem.angle = (random() - .5) * .3;
  // One independently timed studio-light reflection, while the stone is in view.
  gem.reflectionAt = gem.duration * (.25 + random() * .3);
  gem.reflectionDuration = .45 + random() * .25;
  gem.reflectionVariant = random() < .5 ? 0 : 1;
  gem.lightRadius = gem.size >= 60 ? gem.size * 1.5 + 45 : gem.size * .65 + 24;
}

export function createDiamondRain(width: number, random = Math.random): Diamond[] {
  const count = Math.min(168, Math.max(72, Math.round(width / 9)));
  const columns = Math.max(4, Math.ceil(width / 100));
  return Array.from({ length: count }, (_, i) => {
    // Emerald cuts are rare hero stones, not a third of the shower.
    const emerald = i % 7 === 0;
    const foreground = emerald || i % 11 === 0;
    const distant = !foreground && i % 3 === 0;
    const gem: Diamond = {
      x: 0, y: 0,
      size: emerald ? 78 + random() * 16 : foreground ? 70 + random() * 16 : distant ? 28 + random() * 12 : 40 + random() * 20,
      opacity: foreground ? .98 : distant ? .45 + random() * .15 : .75 + random() * .2,
      cut: emerald ? 1 : i % 2 === 0 ? 0 : 2,
      // Premium cuts reveal more of the background without extra rendering passes.
      light: emerald ? .15 : foreground ? .12 : .04 + random() * .025,
      lightRadius: 0,
      reflection: 0, reflectionAt: 0, reflectionDuration: 0, reflectionVariant: 0,
      releaseAt: random() * 2.6,
      duration: 0, angle: 0,
    };
    initializeFlight(gem, width, i % columns, columns, random);
    return gem;
  });
}

/** One shower: each particle falls once, then remains finished. */
export function advanceDiamond(gem: Diamond, elapsed: number, height: number): boolean {
  const age = elapsed - gem.releaseAt;
  gem.reflection = 0;
  if (age >= gem.duration) return false;
  if (age < 0) return true;

  const reflectionProgress = (age - gem.reflectionAt) / gem.reflectionDuration;
  if (reflectionProgress > 0 && reflectionProgress < 1) {
    const envelope = Math.sin(Math.PI * reflectionProgress);
    gem.reflection = envelope * envelope;
  }
  const progress = age / gem.duration;
  const distance = height + gem.size * 2;
  // Gravity-like acceleration, with a fixed x coordinate for the entire fall.
  gem.y = -gem.size + distance * (.65 * progress + .35 * progress * progress);
  return true;
}

/** A single gentle background-light swell, never a flash or a second wave. */
export function celebrationGlow(elapsed: number): number {
  const rise = Math.max(0, Math.min(1, elapsed / .8));
  const fade = Math.max(0, Math.min(1, (7 - elapsed) / 4));
  const smooth = (value: number) => value * value * (3 - 2 * value);
  return .06 * smooth(rise) * smooth(fade);
}
