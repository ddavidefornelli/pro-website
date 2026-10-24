import { element } from "./dom";

export function rainDiamonds(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelector(".diamond-rain")?.remove();
  const shower = element("div", undefined, "diamond-rain");
  shower.setAttribute("aria-hidden", "true");
  const fragments = document.createDocumentFragment();
  for (let i = 0; i < 220; i++) {
    const diamond = element("span", undefined, "falling-diamond");
    const crystal = element("span", undefined, "diamond-crystal");
    const foreground = i % 7 === 0;
    diamond.classList.toggle("is-foreground", foreground);
    diamond.style.left = `${Math.random() * 104 - 2}%`;
    diamond.style.setProperty("--size", `${foreground ? 32 + Math.random() * 18 : 10 + Math.random() * 20}px`);
    diamond.style.setProperty("--depth-opacity", `${foreground ? .95 : .45 + Math.random() * .4}`);
    diamond.style.setProperty("--drift", `${(Math.random() - 0.5) * 180}px`);
    diamond.style.setProperty("--tilt", `${(Math.random() - 0.5) * 100}deg`);
    diamond.style.setProperty("--glint-delay", `${-Math.random() * 3}s`);
    diamond.style.setProperty("--turn-duration", `${2.4 + Math.random() * 2.4}s`);
    diamond.style.animationDelay = `${Math.random() * 2.7}s`;
    diamond.style.animationDuration = `${foreground ? 3.8 + Math.random() : 4.5 + Math.random() * 1.8}s`;
    diamond.append(crystal);
    fragments.append(diamond);
  }
  shower.append(fragments);
  document.body.append(shower);
  window.setTimeout(() => shower.remove(), 9500);
}
