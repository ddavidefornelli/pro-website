import { actionButton, element } from "./dom";
import { errorMessage } from "./errors";

export type TourView = "today" | "focus" | "tomorrow" | "habits";
const stops: { view: TourView; target: string; title: string; text: string }[] = [
  { view: "today", target: ".task .editable-title", title: "Your task is here", text: "Tap the title to edit it. Keep today to three tasks." },
  { view: "today", target: ".task .task-estimate", title: "Adjust your estimate", text: "Turn this dial to change the minutes." },
  { view: "tomorrow", target: 'nav button[aria-current]', title: "Plan ahead", text: "Add tomorrow’s tasks here." },
  { view: "habits", target: 'nav button[aria-current]', title: "See your progress", text: "Your activity and weekly reviews live here." },
  { view: "today", target: ".task > button", title: "Ready to focus?", text: "Start your task’s timer when you’re ready. You can pause anytime." },
];

/** Anchored coach marks, without starting a timer or making any task changes. */
export function openPlannerTour(host: HTMLElement, visit: (view: TourView) => void, done: (started: boolean) => void, start?: () => Promise<void>): void {
  let index = 0;
  let busy = false;
  let target: HTMLElement | null = null;
  let frame = 0;
  const dialog = element("dialog", undefined, "planner-tour-dialog");
  dialog.setAttribute("aria-labelledby", "planner-tour-heading");
  const highlight = element("div", undefined, "tour-highlight");
  highlight.setAttribute("aria-hidden", "true");
  const popup = element("section", undefined, "tour-popup");
  const arrow = element("span", undefined, "tour-arrow");
  arrow.setAttribute("aria-hidden", "true");
  dialog.append(highlight, popup, arrow);
  const position = () => {
    if (!target?.isConnected) return;
    const rect = target.getBoundingClientRect();
    const width = window.innerWidth;
    const height = window.innerHeight;
    Object.assign(highlight.style, { left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${rect.width + 10}px`, height: `${rect.height + 10}px` });
    const box = popup.getBoundingClientRect();
    const left = Math.max(12, Math.min(width - box.width - 12, rect.left + rect.width / 2 - box.width / 2));
    const below = rect.bottom + box.height + 26 < height;
    const top = below ? rect.bottom + 18 : Math.max(12, rect.top - box.height - 18);
    Object.assign(popup.style, { left: `${left}px`, top: `${top}px` });
    const x = Math.max(left + 16, Math.min(left + box.width - 24, rect.left + rect.width / 2));
    Object.assign(arrow.style, { left: `${x}px`, top: `${below ? top - 5 : top + box.height - 5}px` });
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); };
  const observer = new ResizeObserver(schedule);
  const finish = (started = false) => {
    if (busy) return;
    observer.disconnect();
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
    dialog.close();
    dialog.remove();
    done(started);
  };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(); });
  const render = () => {
    const stop = stops[index]!;
    visit(stop.view);
    target = host.querySelector<HTMLElement>(stop.target) ?? host.querySelector<HTMLElement>('nav button[aria-current]');
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    popup.replaceChildren();
    const top = element("div", undefined, "onboarding-top");
    top.append(element("span", `${index + 1} / ${stops.length}`, "onboarding-eyebrow"), actionButton("Skip tour", () => finish()));
    const heading = element("h2", stop.title);
    heading.id = "planner-tour-heading";
    heading.tabIndex = -1;
    const actions = element("div", undefined, "onboarding-actions");
    const error = element("p", "", "error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    if (index > 0) actions.append(actionButton("Back", () => { index--; render(); }));
    if (index === stops.length - 1) {
      actions.append(actionButton("Not now", () => finish()));
      if (start) {
        const focus = actionButton("Start focusing", async () => {
          if (busy) return;
          busy = true;
          popup.querySelectorAll("button").forEach((button) => { button.disabled = true; });
          try { await start(); busy = false; finish(true); }
          catch (cause) {
            busy = false;
            error.textContent = errorMessage(cause);
            error.hidden = false;
            popup.querySelectorAll("button").forEach((button) => { button.disabled = false; });
          }
        });
        focus.className = "onboarding-primary";
        actions.append(focus);
      } else actions.append(actionButton("Done", () => finish()));
    } else {
      const next = actionButton("Next", () => { index++; render(); });
      next.className = "onboarding-primary";
      actions.append(next);
    }
    popup.append(top, heading, element("p", stop.text, "muted"), error, actions);
    if (dialog.open) heading.focus({ preventScroll: true });
    schedule();
  };
  host.append(dialog);
  render();
  dialog.showModal();
  observer.observe(popup);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  dialog.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
  schedule();
}
