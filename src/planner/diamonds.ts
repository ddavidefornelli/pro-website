import { advanceDiamond, celebrationGlow, createDiamondRain } from "./diamond-motion";

let stopRain: (() => void) | undefined;

type Artwork = {
  sprites: HTMLCanvasElement[];
  reflections: HTMLCanvasElement[][];
  masks: HTMLCanvasElement[];
  background: HTMLImageElement | undefined;
};
let cachedArtwork: Promise<Artwork | undefined> | undefined;

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(undefined);
    image.src = src;
  });
}

// Real facet planes for each cut, baked into two reflection variants per stone.
const REFLECTION_FACETS = [
  [
    "M45 12H75L90 31 76 40H44L30 31Z M76 40 98 45 60 101Z",
    "M26 8 45 12 30 31Z M22 45 44 40 60 101Z M44 40 60 57 60 101Z",
  ],
  [
    "M39 5H81L76 15H44Z M33 28 41 33V75L33 80Z M67 34 72 40V68L67 74 65 69 68 65V43L65 39Z",
    "M76 15 87 28V80L79 75V33L72 24Z M48 24H72L67 34H53Z M53 74H67L72 84H48Z",
  ],
  [
    "M47 23 60 17 73 23 81 32 65 33H55L39 32Z M60 57 80 55 60 103Z",
    "M26 25 39 32 36 44 20 43Z M40 55 48 47 60 57 60 72Z M40 55 50 75 60 103 38 77Z",
  ],
];

function createReflection(sprite: HTMLCanvasElement, cut: number, variant: number) {
  const reflection = document.createElement("canvas");
  reflection.width = sprite.width;
  reflection.height = sprite.height;
  const context = reflection.getContext("2d");
  if (!context) return;
  context.scale(sprite.width / 120, sprite.height / 108);
  const highlight = context.createLinearGradient(25, 12, 90, 95);
  highlight.addColorStop(0, "rgba(255,255,255,0.08)");
  highlight.addColorStop(.4, "rgba(255,255,255,0.5)");
  highlight.addColorStop(.55, "rgba(255,255,255,0.95)");
  highlight.addColorStop(1, "rgba(235,247,255,0.15)");
  const facets = new Path2D(REFLECTION_FACETS[cut][variant]);
  context.fillStyle = highlight;
  context.fill(facets);
  context.strokeStyle = "rgba(255,255,255,0.8)";
  context.lineWidth = .6;
  context.stroke(facets);
  // Confine every highlight to the gemstone's alpha, including fallback artwork.
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(sprite, 0, 0);
  return reflection;
}

function createLightMask(soft: boolean) {
  const mask = document.createElement("canvas");
  mask.width = mask.height = 128;
  const context = mask.getContext("2d");
  if (!context) return;
  const light = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  light.addColorStop(0, soft ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,1)");
  light.addColorStop(soft ? .4 : .22, soft ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)");
  light.addColorStop(.75, "rgba(255,255,255,0.06)");
  light.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = light;
  context.fillRect(0, 0, 128, 128);
  return mask;
}

function loadArtwork(): Promise<Artwork | undefined> {
  return cachedArtwork ??= Promise.all([
    loadImage("/diamond.svg"),
    loadImage("/diamond-emerald.svg"),
    loadImage("/diamond-pear.svg"),
    loadImage("/prune-background.png"),
  ]).then(([brilliant, emerald, pear, background]) => {
    const fallback = brilliant ?? emerald ?? pear;
    if (!fallback) { cachedArtwork = undefined; return; }
    const sprites: HTMLCanvasElement[] = [];
    const reflections: HTMLCanvasElement[][] = [];
    for (const image of [brilliant, emerald, pear]) {
      const sprite = document.createElement("canvas");
      sprite.width = 168;
      sprite.height = 152;
      const context = sprite.getContext("2d");
      if (!context) return;
      context.drawImage(image ?? fallback, 0, 0, sprite.width, sprite.height);
      const first = createReflection(sprite, sprites.length, 0);
      const second = createReflection(sprite, sprites.length, 1);
      if (!first || !second) return;
      sprites.push(sprite);
      reflections.push([first, second]);
    }
    // Both light profiles and all facet highlights are rasterized only once.
    const tight = createLightMask(false);
    const soft = createLightMask(true);
    if (!tight || !soft) return;
    return { sprites, reflections, masks: [tight, soft], background };
  });
}

function createIllumination(background: HTMLImageElement, width: number, height: number) {
  // A bounded lighting surface behind the UI reveals artwork, not white fog.
  const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1280 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.className = "diamond-illumination";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  const texture = document.createElement("canvas");
  texture.width = canvas.width;
  texture.height = canvas.height;
  const textureContext = texture.getContext("2d");
  if (!context || !textureContext) return;
  context.scale(scale, scale);
  // Match body::before's centered auto / clamp(70svh, 50vw, 100svh) artwork.
  const artworkHeight = Math.max(height * .7, Math.min(width * .5, height));
  const artworkWidth = artworkHeight * background.naturalWidth / background.naturalHeight;
  textureContext.drawImage(background,
    (width - artworkWidth) / 2 * scale, (height - artworkHeight) / 2 * scale,
    artworkWidth * scale, artworkHeight * scale);
  // Grayscale once, including in browsers without CanvasRenderingContext2D.filter.
  const pixels = textureContext.getImageData(0, 0, texture.width, texture.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
  }
  textureContext.putImageData(pixels, 0, 0);
  return { canvas, context, texture };
}

function showCompletionMoment(reducedMotion: boolean): () => void {
  const moment = document.createElement("div");
  moment.className = "completion-moment";
  moment.setAttribute("role", "status");
  moment.setAttribute("aria-atomic", "true");
  const title = document.createElement("h2");
  title.textContent = "today you won.";
  moment.append(title);
  document.body.append(moment);
  const cleanup = () => {
    window.clearTimeout(timer);
    moment.remove();
    if (stopRain === cleanup) stopRain = undefined;
  };
  const timer = window.setTimeout(cleanup, reducedMotion ? 4200 : 5600);
  stopRain = cleanup;
  return cleanup;
}

export function rainDiamonds(): void {
  stopRain?.();
  if (document.hidden) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const removeMoment = showCompletionMoment(motion.matches);
  // Reduced-motion users still get a clear acknowledgement of their achievement.
  if (motion.matches) return;

  const canvas = document.createElement("canvas");
  canvas.className = "diamond-rain";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 1.5, 1800 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.scale(scale, scale);

  let illumination: ReturnType<typeof createIllumination>;
  let frame = 0;
  let stopped = false;
  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    canvas.remove();
    illumination?.canvas.remove();
    removeMoment();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("resize", cleanup);
    motion.removeEventListener("change", cleanup);
    if (stopRain === cleanup) stopRain = undefined;
  };
  const onVisibilityChange = () => { if (document.hidden) cleanup(); };
  const timeout = window.setTimeout(cleanup, 12000);
  stopRain = cleanup;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("resize", cleanup, { once: true });
  motion.addEventListener("change", cleanup, { once: true });
  void loadArtwork().then(artwork => {
    if (stopped) return;
    if (!artwork) { cleanup(); return; }
    if (artwork.background) illumination = createIllumination(artwork.background, width, height);
    if (illumination) document.body.append(illumination.canvas);
    document.body.append(canvas);
    // Keep hero gems if density must be reduced; render distant stones first.
    const gems = createDiamondRain(width).sort((a, b) => b.size - a.size);
    let budget = gems.length;
    let slowFrames = 0;
    let start: number | undefined;
    let previous = 0;
    const draw = (now: number) => {
      if (stopped) return;
      if (start === undefined) { start = now; previous = now; }
      const elapsed = (now - start) / 1000;
      const frameTime = now - previous;
      previous = now;
      slowFrames = frameTime > 26 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames >= 16 && budget > 32) {
        budget = Math.max(32, budget - 16);
        slowFrames = 0;
      }
      context.clearRect(0, 0, width, height);
      const lightContext = illumination?.context;
      lightContext?.clearRect(0, 0, width, height);
      if (lightContext) {
        lightContext.globalAlpha = celebrationGlow(elapsed);
        lightContext.drawImage(artwork.masks[1], -width * .2, -height * .2, width * 1.4, height * 1.4);
      }
      let pending = false;
      for (let i = budget - 1; i >= 0; i--) {
        const gem = gems[i];
        if (!advanceDiamond(gem, elapsed, height)) continue;
        pending = true;
        if (elapsed < gem.releaseAt || gem.y < -gem.size || gem.y > height + gem.size) continue;
        if (lightContext) {
          const wide = gem.size >= 60;
          const radius = gem.lightRadius;
          const verticalRadius = radius * (wide ? .8 : 1);
          const age = elapsed - gem.releaseAt;
          const fade = Math.min(1, age / .2, (gem.duration - age) / .3);
          lightContext.globalAlpha = gem.light * fade * (1 + gem.reflection * .18);
          lightContext.drawImage(artwork.masks[wide ? 1 : 0],
            gem.x - radius, gem.y - verticalRadius, radius * 2, verticalRadius * 2);
        }
        context.globalAlpha = gem.opacity;
        context.save();
        context.translate(gem.x, gem.y);
        context.rotate(gem.angle);
        context.drawImage(artwork.sprites[gem.cut], -gem.size / 2, -gem.size * .45, gem.size, gem.size * .9);
        if (gem.reflection > .01) {
          context.globalAlpha = gem.opacity * gem.reflection * (gem.cut === 1 ? .7 : .5);
          context.drawImage(artwork.reflections[gem.cut][gem.reflectionVariant],
            -gem.size / 2, -gem.size * .45, gem.size, gem.size * .9);
        }
        context.restore();
      }
      if (illumination && lightContext) {
        // Raise the background's opacity only under the passing lights.
        lightContext.globalAlpha = 1;
        lightContext.globalCompositeOperation = "source-in";
        lightContext.drawImage(illumination.texture, 0, 0, width, height);
        lightContext.globalCompositeOperation = "source-over";
      }
      if (!pending || elapsed > 10) { cleanup(); return; }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  }).catch(cleanup);
}
