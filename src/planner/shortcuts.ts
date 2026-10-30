import { onCleanup, onMount } from "solid-js";
import type { PlannerView } from "./constants.ts";
import type { PlannerState } from "./create-planner.ts";

export const SHORTCUTS = [
  { key: "N", label: "New outcome" },
  { key: "T", label: "Today" },
  { key: "F", label: "Focus" },
  { key: "M", label: "Tomorrow" },
  { key: "O", label: "Overview" },
  { key: "Space", label: "Pause or resume the timer" },
  { key: "?", label: "Show shortcuts" },
] as const;

const VIEW_KEYS: Record<string, PlannerView> = {
  t: "today",
  f: "focus",
  m: "tomorrow",
  o: "habits",
};

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest("input, textarea, select, [role='slider']"))
  );
}

/** Keyboard-first navigation that follows the same locks as the visible controls. */
export function createShortcuts(
  planner: PlannerState,
  onHelp: () => void,
): void {
  const canVisit = (view: PlannerView) =>
    !planner.busy() &&
    !(planner.focusLocked() && view !== "focus") &&
    !(view === "focus" && planner.todayComplete());

  function handle(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
    if (event.altKey || typing(event.target)) return;
    if (document.querySelector("dialog[open]")) return;
    const key = event.key.toLowerCase();

    if (key === "?" || (event.code === "Slash" && event.shiftKey)) {
      event.preventDefault();
      onHelp();
    } else if (key === " " && planner.view() === "focus") {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      document.querySelector<HTMLButtonElement>("#focus-timer")?.click();
    } else if (key === "n") {
      const view = planner.view();
      if (view !== "today" && view !== "tomorrow") {
        if (!canVisit("today")) return;
        planner.visit("today");
      }
      event.preventDefault();
      queueMicrotask(() =>
        document.querySelector<HTMLInputElement>(".task-form input")?.focus(),
      );
    } else if (key in VIEW_KEYS && !event.shiftKey) {
      const view = VIEW_KEYS[key]!;
      if (!canVisit(view)) return;
      event.preventDefault();
      planner.visit(view);
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handle);
    onCleanup(() => document.removeEventListener("keydown", handle));
  });
}
