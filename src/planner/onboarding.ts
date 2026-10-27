import type { Dashboard } from "./api";
import { actionButton, element } from "./dom";
import { errorMessage } from "./errors";
import { estimateDial } from "./estimate-dial";
import { PLANNER_LIMITS } from "./planner";

export const onboardingKey = (accountKey: string) => `prune:onboarding:v1:${accountKey}`;

/** Prototype: completion is remembered per account on this browser, not on the server. */
export function openFirstTaskOnboarding(
  host: HTMLElement,
  accountKey: string,
  data: Dashboard,
  create: (outcome: string, minutes: number) => Promise<void>,
  start: () => Promise<void>,
  tour: (start: () => Promise<void>) => void,
): void {
  const key = onboardingKey(accountKey);
  try { if (localStorage.getItem(key)) return; } catch { /* Storage may be unavailable. */ }
  if (data.activeTask || data.todayTasks.length || data.tomorrowTasks.length || data.completions.some((day) => day.count > 0)) return;

  const dialog = element("dialog", undefined, "first-task-dialog");
  dialog.setAttribute("aria-labelledby", "first-task-heading");
  let step = 1;
  let outcome = "";
  let minutes = 30;
  let busy = false;
  const remember = () => {
    try { localStorage.setItem(key, "done"); } catch { /* The flow still works without persistence. */ }
  };
  const close = () => {
    if (busy) return;
    remember();
    dialog.close();
    dialog.remove();
    host.querySelector<HTMLButtonElement>(".task button, .task-form input")?.focus();
  };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  const render = () => {
    dialog.replaceChildren();
    const top = element("div", undefined, "onboarding-top");
    top.append(element("span", `${step} OF 2`, "onboarding-eyebrow"));
    top.append(actionButton("Skip for now", close));
    const progress = element("div", undefined, "onboarding-progress");
    progress.setAttribute("aria-hidden", "true");
    for (let index = 1; index <= 2; index++) {
      const segment = element("span");
      segment.classList.toggle("is-done", index <= step);
      progress.append(segment);
    }
    const heading = element("h1", step === 1 ? "Start with one small win." : "Make a little space for it.");
    heading.id = "first-task-heading";
    heading.tabIndex = -1;
    const description = element("p", step === 1
      ? "What’s one thing you’d like to finish today?"
      : "Choose a realistic estimate. A small, focused session is a great place to start.", "muted");
    dialog.append(top, progress, heading, description);
    const form = element("form", undefined, "onboarding-form");
    const actions = element("div", undefined, "onboarding-actions");
    const error = element("p", "", "error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    if (step === 1) {
      const input = element("input");
      input.id = "first-task-outcome";
      input.setAttribute("aria-label", "Task outcome");
      input.value = outcome;
      input.placeholder = "e.g. Write the first draft of my proposal";
      input.required = true;
      input.maxLength = PLANNER_LIMITS.outcomeLength;
      input.addEventListener("input", () => input.setCustomValidity(""));
      form.append(input);
      const next = element("button", "Next: set a time estimate");
      next.type = "submit";
      actions.append(next);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        input.setCustomValidity(input.value.trim() ? "" : "Write one thing you’d like to finish.");
        if (!form.reportValidity()) return;
        outcome = input.value.trim();
        step = 2;
        render();
      });
    } else if (step === 2) {
      form.append(element("p", outcome, "onboarding-outcome"));
      const estimate = estimateDial(minutes);
      const estimateRow = element("div", undefined, "onboarding-estimate");
      estimateRow.append(estimate.element, element("p", "Minutes of focus", "muted"));
      form.append(estimateRow, element("p", "Turn the dial or use the arrow keys · 5–60 minutes", "onboarding-hint"));
      actions.append(actionButton("Back", () => { minutes = estimate.minutes(); step = 1; render(); }));
      const submit = element("button", "Create my first task");
      submit.type = "submit";
      actions.append(submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        busy = true;
        dialog.querySelectorAll("button").forEach((button) => { button.disabled = true; });
        estimate.element.querySelector('[role="slider"]')?.setAttribute("aria-disabled", "true");
        submit.textContent = "Creating…";
        try {
          await create(outcome, estimate.minutes());
          remember();
          dialog.close();
          dialog.remove();
          tour(start);
        } catch (cause) {
          error.textContent = errorMessage(cause);
          error.hidden = false;
          dialog.querySelectorAll("button").forEach((button) => { button.disabled = false; });
          estimate.element.querySelector('[role="slider"]')?.removeAttribute("aria-disabled");
          submit.textContent = "Create my first task";
        } finally { busy = false; }
      });
    }
    form.append(error, actions);
    dialog.append(form);
    if (dialog.open) heading.focus();
  };
  render();
  host.append(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>("input")?.focus();
}
