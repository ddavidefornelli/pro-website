export const CROWN_DURATION = 7.6;

const smooth = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

/** Time-based, so the crown spins at the same speed on every display. */
export function crownFrame(elapsed: number) {
  const time = Math.max(0, elapsed);
  const entrance = smooth(time / .8);
  const exit = smooth((CROWN_DURATION - time) / 1.1);
  return {
    opacity: entrance * exit,
    scale: .88 + entrance * .12,
    rotationX: -.19 + Math.sin(time * .9) * .045,
    rotationY: -.22 + time * Math.PI * 2 / 6.4,
    rotationZ: -.07 + Math.sin(time * .7) * .035,
    y: Math.sin(time * 1.6) * .055,
    finished: time >= CROWN_DURATION,
  };
}

export type CrownFrame = ReturnType<typeof crownFrame>;
