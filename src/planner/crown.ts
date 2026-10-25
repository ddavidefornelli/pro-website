import { CROWN_DURATION, crownFrame } from "./crown-motion";
import { createCrownRenderer } from "./crown-renderer";

let stopCelebration: (() => void) | undefined;

/** A single non-interactive celebration; no UI lock, text overlay, or replay. */
export function celebrateWithCrown(): void {
  stopCelebration?.();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (document.hidden || motion.matches) return;

  const layer = document.createElement("div");
  layer.className = "crown-celebration";
  layer.setAttribute("aria-hidden", "true");
  layer.style.opacity = "0";
  const canvas = document.createElement("canvas");
  canvas.className = "crown-canvas";
  layer.append(canvas);
  document.body.append(layer);

  let view: ReturnType<typeof createCrownRenderer>;
  let observer: ResizeObserver | undefined;
  let frame = 0;
  let stopped = false;
  let start: number | undefined;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    observer?.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    view?.dispose();
    layer.remove();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", cleanup);
    motion.removeEventListener("change", onMotionChange);
    if (stopCelebration === cleanup) stopCelebration = undefined;
  };
  const showFallback = () => {
    observer?.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    view?.dispose();
    view = undefined;
    canvas.remove();
    layer.dataset.renderer = "fallback";
    if (layer.querySelector("img")) return;
    // A static render of the same model, not a flat image pretending to be 3D.
    const poster = document.createElement("img");
    poster.src = "/crown.png";
    poster.alt = "";
    poster.className = "crown-fallback";
    layer.append(poster);
  };
  const onContextLost = (event: Event) => { event.preventDefault(); showFallback(); };
  const onVisibilityChange = () => { if (document.hidden) cleanup(); };
  const onMotionChange = () => { if (motion.matches) cleanup(); };
  const timeout = window.setTimeout(cleanup, (CROWN_DURATION + 2) * 1000);
  stopCelebration = cleanup;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", cleanup);
  motion.addEventListener("change", onMotionChange);
  canvas.addEventListener("webglcontextlost", onContextLost);

  const draw = (now: number) => {
    if (stopped) return;
    start ??= now;
    const pose = crownFrame((now - start) / 1000);
    if (pose.finished) { cleanup(); return; }
    layer.style.opacity = String(pose.opacity);
    try { view?.render(pose); } catch { showFallback(); }
    frame = requestAnimationFrame(draw);
  };
  // Let the completed task list paint before initializing the WebGL studio.
  frame = requestAnimationFrame(() => {
    if (stopped) return;
    try {
      view = createCrownRenderer(canvas);
      if (view) {
        layer.dataset.renderer = "webgl";
        observer = new ResizeObserver(() => view?.resize());
        observer.observe(canvas);
      } else showFallback();
    } catch { showFallback(); }
    draw(performance.now());
  });
}
