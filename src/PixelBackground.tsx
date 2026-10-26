import { onCleanup, onMount } from "solid-js";
import {
  createPixelCells, pixelAlpha, PIXEL_FRAME_INTERVAL,
  PIXEL_HEIGHT, PIXEL_SIZE, PIXEL_WIDTH, type PixelCell,
} from "./shared/pixel-background";

export default function PixelBackground() {
  let canvas!: HTMLCanvasElement;

  onMount(() => {
    const context = canvas.getContext("2d");
    const app = document.getElementById("app");
    if (!context || !app) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cells: PixelCell[] | undefined;
    let alphas = new Uint8Array(0);
    let level = 0;
    let timer: number | undefined;
    const revealedAt = [0, Infinity, Infinity, Infinity];

    const stop = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };

    const initialize = (): PixelCell[] => {
      const pixels = createPixelCells();
      alphas = new Uint8Array(pixels.length);
      // Grid lines are drawn once. Updating cell interiors never erases them.
      context.fillStyle = "#ff123b";
      context.globalAlpha = 0.04;
      for (let x = 0; x < PIXEL_WIDTH; x += PIXEL_SIZE) {
        context.fillRect(x, 0, 1, PIXEL_HEIGHT);
      }
      for (let y = 0; y < PIXEL_HEIGHT; y += PIXEL_SIZE) {
        context.fillRect(0, y, PIXEL_WIDTH, 1);
      }
      context.globalAlpha = 1;
      return pixels;
    };

    const draw = () => {
      timer = undefined;
      if (level === 0 || document.hidden) return;
      // No cell generation or painting until there is progress to display.
      const pixels = cells ??= initialize();
      const now = performance.now();
      const reducedMotion = motion.matches;
      for (let index = 0; index < pixels.length; index++) {
        const cell = pixels[index];
        const alpha = cell.tier <= level
          ? pixelAlpha(cell, now - revealedAt[cell.tier], reducedMotion) : 0;
        if (alpha === alphas[index]) continue;
        alphas[index] = alpha;
        context.clearRect(cell.x, cell.y, PIXEL_SIZE - 1, PIXEL_SIZE - 1);
        if (alpha === 0) continue;
        context.fillStyle = cell.tier === 1 ? "#ff5872" : "#ff123b";
        context.globalAlpha = alpha / 255;
        context.fillRect(cell.x, cell.y, PIXEL_SIZE - 1, PIXEL_SIZE - 1);
      }
      context.globalAlpha = 1;
      // Slow ambient changes need at most 10 updates/second, not a 60fps loop.
      // Reduced motion gets one static frame with no recurring work.
      if (!reducedMotion) timer = window.setTimeout(draw, PIXEL_FRAME_INTERVAL);
    };

    const redraw = () => {
      stop();
      draw();
    };

    const syncLevel = () => {
      const next = Math.max(0, Math.min(3, Math.floor(Number(app.dataset.completionLevel) || 0)));
      if (next === level) return;
      const now = performance.now();
      for (let tier = 1; tier <= 3; tier++) {
        if (tier > next) revealedAt[tier] = Infinity;
        else if (tier > level) revealedAt[tier] = now;
      }
      level = next;
      redraw();
    };

    // Observe only the existing progress attribute, not planner DOM updates.
    const observer = new MutationObserver(syncLevel);
    observer.observe(app, { attributes: true, attributeFilter: ["data-completion-level"] });
    document.addEventListener("visibilitychange", redraw);
    motion.addEventListener("change", redraw);
    syncLevel();

    onCleanup(() => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", redraw);
      motion.removeEventListener("change", redraw);
    });
  });

  return (
    <div class="cyber-artwork" aria-hidden="true">
      {/* Fixed resolution avoids multiplying background work on Retina screens. */}
      <canvas class="pixel-grid" ref={canvas} width={PIXEL_WIDTH} height={PIXEL_HEIGHT} />
    </div>
  );
}
