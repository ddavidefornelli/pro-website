import { PlanningClient, type Dashboard, type Task } from "./api";
import { estimateDial } from "./estimate-dial";
import { createActivityCalendar } from "./activity-calendar-mount";
import { WeeklyReviewPanel } from "./weekly-review";
import { authenticate } from "./auth";
import { profileIcon, profilePage } from "./profile";
import { actionButton, decorativeSvg, element, svgElement } from "./dom";
import { errorMessage } from "./errors";
import { isDayComplete, PLANNER_LIMITS, trackedSeconds } from "./planner";
import { formatDuration } from "./time";
import { openFirstTaskOnboarding } from "./onboarding";

type View = "today" | "focus" | "tomorrow" | "habits" | "profile";

const FOCUS_RING_RADIUS = 54;
const FOCUS_RING_CIRCUMFERENCE = 2 * Math.PI * FOCUS_RING_RADIUS;
const PLANNER_BUTTONS = ".account-bar button, nav button, main button";

class PlanningApplication {
  private data: Dashboard | null = null;
  private dataSignature = "";
  private view: View = "today";
  private busy = false;
  private refreshing = false;
  private error = "";
  private clockOffset = 0;
  private pauseReasonOpen = false;
  // Scratchpad only: never included in storage, API calls, or the offline queue.
  private focusNotes = "";
  private focusNotesTaskId: string | null = null;

  private get todayComplete(): boolean {
    return isDayComplete(this.data?.todayTasks ?? []);
  }
  private readonly account = element("header", undefined, "account-bar");
  private readonly profileButton = this.button("Profile", () => {
    this.view = "profile";
    this.render();
  });
  private readonly navigation = element("nav");
  private readonly content = element("main");
  private readonly alert = element("p", "", "error");
  private readonly syncBar = element("div", undefined, "sync-bar");
  private readonly syncLabel = element("span");
  private readonly weeklyReview: WeeklyReviewPanel;
  private readonly activityCalendar = createActivityCalendar();

  constructor(
    private readonly root: HTMLElement,
    private readonly client: PlanningClient,
    private readonly email: string,
    private readonly accountHost: HTMLElement,
    private readonly accountKey: string,
  ) {
    this.weeklyReview = new WeeklyReviewPanel(client);
  }

  async mount(): Promise<void> {
    this.profileButton.className = "profile-button";
    this.profileButton.setAttribute("aria-label", "Profile");
    this.profileButton.setAttribute("aria-controls", "planner-content");
    this.profileButton.replaceChildren(profileIcon());
    this.account.append(this.profileButton);
    this.content.id = "planner-content";
    this.navigation.setAttribute("aria-label", "Main navigation");
    this.alert.setAttribute("role", "alert");
    this.syncLabel.setAttribute("role", "alert");
    const discard = this.button("Discard rejected changes", async () => {
      if (window.confirm("Discard ALL pending changes on this device, including changes depending on the rejected action? Synced changes will be kept.")) {
        await this.client.discardPending();
      }
    });
    const updateSyncStatus = () => {
      // Routine saves and connection retries stay invisible. Only a rejected
      // change needs a user decision; never silently discard pending work.
      this.syncBar.hidden = !this.client.syncBlocked;
      this.syncLabel.textContent = this.client.syncBlocked
        ? "Some recent changes could not be applied. They are kept on this device until you discard them."
        : "";
      const next = this.client.cachedDashboard();
      if (next && !this.refreshDeferred && this.applyDashboard(next)) this.render();
    };
    this.client.onQueueChange = updateSyncStatus;
    this.syncBar.append(this.syncLabel, discard);
    this.accountHost.replaceChildren();
    const navigationHeader = element("div", undefined, "navigation-header");
    navigationHeader.append(this.navigation);
    this.root.append(navigationHeader, this.syncBar, this.alert, this.content);
    updateSyncStatus();
    new ResizeObserver(() => this.updateNavigationIndicator()).observe(this.navigation);
    await this.refresh(true);
    if (this.data) {
      let firstTask: Task | null = null;
      openFirstTaskOnboarding(this.root, this.accountKey, this.data, async (outcome, minutes) => {
        firstTask = await this.client.create(outcome, this.data!.today, minutes);
        this.applyDashboard(await this.client.dashboard());
        this.view = "today";
        this.render();
      }, async () => {
        if (!firstTask) return;
        await this.client.start(firstTask.id);
        this.applyDashboard(await this.client.dashboard());
        this.view = "focus";
        this.render();
      });
    }
    const checkReview = async () => {
      await this.client.generateIfDue().catch(() => { /* Server quotas enforce retry backoff. */ });
      if (this.view === "habits" || this.view === "profile") await this.weeklyReview.refresh();
    };
    void checkReview();
    window.setInterval(() => { void checkReview(); }, 60_000);
    window.setInterval(() => this.tick(), 1000);
    // Refresh after sleep/date rollover without replacing an in-progress form.
    window.setInterval(() => {
      void this.refresh(false);
    }, 30_000);
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      this.tick();
      void this.refresh(false);
      void this.client.sync();
      void checkReview();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
  }

  private get refreshDeferred(): boolean {
    return this.busy || this.refreshing || this.pauseReasonOpen || !!this.root.querySelector("dialog[open]")
      || !!document.activeElement?.matches("input, textarea, [role=slider]");
  }

  private applyDashboard(next: Dashboard): boolean {
    const signature = JSON.stringify({ ...next, serverNow: 0 });
    const changed = signature !== this.dataSignature;
    this.dataSignature = signature;
    this.data = next;
    // Include tasks planned on earlier days but completed today; cap the visual at full signal.
    const completedToday = next.completions.find((completion) => completion.day === next.today)?.count ?? 0;
    this.root.dataset.completionLevel = String(Math.max(0, Math.min(PLANNER_LIMITS.tasksPerDay, completedToday)));
    this.clockOffset = next.serverNow * 1000 - Date.now();
    return changed;
  }

  private async refresh(initial: boolean): Promise<void> {
    if (this.refreshDeferred) return;
    this.refreshing = true;
    try {
      const next = await this.client.dashboard();
      const changed = this.applyDashboard(next);
      if (initial && next.activeTask) this.view = "focus";
      if (changed || this.error) {
        this.error = "";
        this.render();
      }
    } catch (error) {
      this.error = this.message(error);
      this.render();
    } finally {
      this.refreshing = false;
      if (this.data && this.view === "habits") void this.weeklyReview.refresh();
    }
  }

  private render(): void {
    const activeTaskId = this.data?.activeTask?.id ?? null;
    if (this.focusNotesTaskId !== activeTaskId) {
      this.focusNotesTaskId = activeTaskId;
      this.focusNotes = "";
    }
    this.alert.textContent = this.error;
    this.alert.hidden = !this.error;
    this.navigation.replaceChildren();
    const views: [View, string][] = [
      ["today", "Today"],
      ...(!this.todayComplete ? [["focus", "Focus"] as [View, string]] : []),
      ["tomorrow", "Tomorrow"],
      ["habits", "Overview"],
    ];
    if (this.todayComplete && this.view === "focus") this.view = "today";
    const focusLocked = this.data?.activeTask != null && this.data.activeTask.startedAt !== null;
    if (focusLocked) this.view = "focus";
    this.profileButton.disabled = this.busy || focusLocked;
    this.profileButton.title = focusLocked ? "Pause the focus timer to access your profile" : "Profile";
    if (this.view === "profile") this.profileButton.setAttribute("aria-current", "page");
    else this.profileButton.removeAttribute("aria-current");
    const viewChanged = this.root.dataset.view !== this.view;
    this.root.dataset.view = this.view;
    if (viewChanged) queueMicrotask(() => window.scrollTo(0, 0));
    this.root.classList.toggle("single-screen", this.view === "today" || this.view === "tomorrow" || this.view === "focus");
    for (const [view, title] of views) {
      const button = this.button(title, () => {
        this.pauseReasonOpen = false;
        this.view = view;
        this.render();
      });
      if (focusLocked && view !== "focus") {
        button.disabled = true;
        button.title = "Pause the focus timer to access other pages";
      }
      if (view === "today" && this.todayComplete) button.classList.add("day-complete");
      if (view === this.view) button.setAttribute("aria-current", "page");
      this.navigation.append(button);
    }
    this.navigation.classList.toggle("today-complete-selected", this.todayComplete && this.view === "today");
    this.updateNavigationIndicator();
    this.content.replaceChildren();
    this.content.setAttribute("aria-label", { today: "Today", tomorrow: "Tomorrow", focus: "Focus", habits: "Overview", profile: "Profile" }[this.view]);
    if (this.view === "profile") {
      if (this.data) this.activityCalendar.update(this.data.today, this.data.completions);
      const profile = profilePage(this.email, this.data, () => this.signOut(), Math.floor((Date.now() + this.clockOffset) / 1000), () => this.deleteAccount(), this.activityCalendar.element);
      profile.insertBefore(this.weeklyReview.settingsElement, profile.querySelector(".profile-footer"));
      this.content.append(profile);
      void this.weeklyReview.refresh();
      return;
    }
    if (!this.data) {
      this.content.append(this.button("Retry", () => this.refresh(false)));
      return;
    }
    if (this.view === "focus") this.renderFocus();
    else if (this.view === "habits") this.renderHabits();
    else this.renderPlan();
    this.tick();
  }

  private updateNavigationIndicator(): void {
    const selected = this.navigation.querySelector<HTMLButtonElement>("button[aria-current]");
    this.navigation.classList.toggle("has-selection", selected !== null);
    if (!selected) return;
    this.navigation.style.setProperty("--selection-left", `${selected.offsetLeft}px`);
    this.navigation.style.setProperty("--selection-width", `${selected.offsetWidth}px`);
    this.navigation.style.setProperty("--selection-height", `${selected.offsetHeight}px`);
  }

  private async deleteAccount(): Promise<void> {
    if (this.busy) return;
    if (!window.confirm("Delete your account? You will lose access immediately. Your account and data will be marked for deletion and kept for 30 days before manual removal. Unsynced changes will not be uploaded. This cannot be undone in the app.")) return;
    this.busy = true;
    this.error = "";
    this.alert.textContent = "";
    this.root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
    const button = this.content.querySelector<HTMLButtonElement>(".delete-account-button");
    if (button) button.textContent = "Deleting account…";
    try {
      await this.client.deleteAccount();
      window.location.reload();
    } catch (error) {
      this.busy = false;
      this.error = this.message(error);
      this.render();
      this.alert.scrollIntoView({ block: "nearest" });
    }
  }

  private async signOut(): Promise<void> {
    if (this.busy) return;
    if (this.client.pendingCount && !window.confirm("Some changes have not synced. They will stay on this device for this account, but will not sync while signed out. Sign out anyway?")) return;
    this.busy = true;
    this.error = "";
    this.alert.textContent = "";
    this.root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
    this.profileButton.disabled = true;
    const button = this.content.querySelector<HTMLButtonElement>(".danger-button");
    if (button) button.textContent = "Signing out…";
    try {
      await this.client.signOut();
      window.location.reload();
    } catch (error) {
      this.busy = false;
      this.error = this.message(error);
      this.render();
      this.alert.scrollIntoView({ block: "nearest" });
    }
  }

  private renderPlan(): void {
    const data = this.data!;
    const tomorrow = this.view === "tomorrow";
    const tasks = tomorrow ? data.tomorrowTasks : data.todayTasks;
    const day = tomorrow ? data.tomorrow : data.today;
    const heading = element("div", undefined, "plan-heading");
    const [year, month, date] = day.split("-");
    const dayLabel = element("time", `${date}/${month}/${year.slice(-2)}`, "plan-date");
    dayLabel.dateTime = day;
    heading.append(dayLabel);
    this.content.append(heading);
    const list = element("ul", undefined, "task-list");
    for (const task of tasks) {
      const item = element("li", undefined, `task${!tomorrow && task.status === "completed" ? " is-completed" : ""}`);
      const details = element("div", undefined, "task-details");
      details.append(this.renderTaskTitle(task, "h2"));
      if (task.status === "completed" || (tomorrow && task.status !== "planned")) {
        details.append(
          element(
            "p",
            task.status === "completed"
              ? formatDuration(task.actualSeconds)
              : `${task.estimatedMinutes} min estimated · ${task.status}`,
            "muted",
          ),
        );
      }
      item.append(details);
      if (task.status === "planned") {
        const estimate = estimateDial(task.estimatedMinutes, async (minutes) => {
          while (this.refreshing) await new Promise((resolve) => window.setTimeout(resolve, 25));
          await this.mutate(() => this.client.changeEstimate(task.id, minutes));
        });
        estimate.element.classList.add("task-estimate");
        if (this.busy) estimate.element.querySelector('[role="slider"]')?.setAttribute("aria-disabled", "true");
        item.append(estimate.element);
      }
      if (!tomorrow && task.status === "planned") {
        const start = this.button("Start focus", () =>
          this.mutate(async () => {
            await this.client.start(task.id);
            this.view = "focus";
          }),
        );
        start.disabled = this.busy || data.activeTask !== null;
        item.append(start);
      }
      if (task.status === "active")
        item.append(
          this.button("Return to focus", () => {
            this.view = "focus";
            this.render();
          }),
        );
      list.append(item);
    }
    this.content.append(list);
    if (tasks.length < PLANNER_LIMITS.tasksPerDay) this.renderForm(day);
  }

  private canEditTask(task: Task): boolean {
    return task.status === "planned" || (task.status === "active" && this.view === "focus");
  }

  private renderTaskTitle(task: Task, tag: "h1" | "h2"): HTMLElement {
    const heading = element(tag, undefined, "editable-title");
    if (!this.canEditTask(task)) {
      heading.append(element("span", task.outcome, "task-title-text"));
      return heading;
    }
    const edit = this.button("", () => {
      const input = element("input");
      input.value = task.outcome;
      input.maxLength = PLANNER_LIMITS.outcomeLength;
      input.setAttribute("aria-label", "Task title");
      let finished = false;
      const save = () => {
        if (finished) return;
        const outcome = input.value.trim();
        finished = true;
        if (!outcome || outcome === task.outcome) {
          heading.replaceChildren(edit);
          return;
        }
        void this.mutate(() => this.client.rename(task.id, outcome));
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        } else if (event.key === "Escape") {
          finished = true;
          heading.replaceChildren(edit);
          edit.focus();
        }
      });
      input.addEventListener("blur", save);
      heading.replaceChildren(input);
      input.focus();
      input.select();
    });
    edit.append(element("span", task.outcome, "task-title-text"));
    edit.title = `${task.outcome} — click to edit`;
    edit.setAttribute("aria-label", `Edit task title: ${task.outcome}`);
    heading.append(edit);
    return heading;
  }

  private renderForm(day: string): void {
    const form = element("form", undefined, "task-form");
    const outcomeLabel = element("label");
    const outcome = element("input");
    outcome.setAttribute("aria-label", "Outcome");
    outcome.name = "outcome";
    outcome.required = true;
    outcome.maxLength = PLANNER_LIMITS.outcomeLength;
    outcome.placeholder = "Add an outcome";
    outcomeLabel.append(outcome);
    const estimate = estimateDial();
    const submit = element("button", undefined, "add-task");
    const plus = decorativeSvg("0 0 24 24");
    plus.append(svgElement("path", { d: "M12 3v18M3 12h18" }));
    submit.append(plus);
    submit.type = "submit";
    submit.title = "Add task";
    submit.setAttribute("aria-label", "Add task");
    submit.disabled = this.busy;
    const estimateInline = element("div", undefined, "task-estimate-inline");
    estimateInline.append(estimate.element);
    form.append(outcomeLabel, estimateInline, submit);

    const estimateDialog = element("dialog", undefined, "pause-dialog task-estimate-dialog");
    estimateDialog.setAttribute("aria-labelledby", "task-estimate-question");
    const dialogContent = element("div", undefined, "pause-form");
    const question = element("h2", "How much time will this task take to complete?");
    question.id = "task-estimate-question";
    const mobileEstimate = estimateDial();
    const confirm = this.button("Add task", () => {
      estimateDialog.close();
      void this.mutate(
        () => this.client.create(outcome.value, day, mobileEstimate.minutes()),
        form,
      );
    });
    const cancel = this.button("Cancel", () => estimateDialog.close());
    dialogContent.append(question, mobileEstimate.element, confirm, cancel);
    estimateDialog.append(dialogContent);
    outcome.addEventListener("input", () => outcome.setCustomValidity(""));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      outcome.setCustomValidity(outcome.value.trim() ? "" : "Please write an outcome for this task.");
      if (!form.reportValidity()) return;
      if (window.matchMedia("(max-width: 759px)").matches) {
        estimateDialog.showModal();
        return;
      }
      void this.mutate(
        () => this.client.create(outcome.value, day, estimate.minutes()),
        form,
      );
    });
    this.content.append(form, estimateDialog);
  }

  private renderFocus(): void {
    const task = this.data!.activeTask;
    if (!task) {
      this.content.append(
        element("p", "Choose a task from Today to begin.", "muted"),
      );
      return;
    }
    const layout = element("div", undefined, "focus-layout");
    const details = element("div", undefined, "focus-details");
    details.append(this.renderTaskTitle(task, "h1"));
    const notesSection = element("div", undefined, "focus-notes");
    const notesLabel = element("label", "Notes");
    const notes = element("textarea");
    notes.id = "focus-notes";
    notesLabel.htmlFor = notes.id;
    notes.rows = 5;
    notes.value = this.focusNotes;
    notes.addEventListener("input", () => { this.focusNotes = notes.value; });
    notesSection.append(notesLabel, notes);
    details.append(notesSection);
    layout.append(details);
    this.content.append(layout);
    const paused = task.startedAt === null;
    const timer = this.button("", async () => {
      if (paused) return this.mutate(() => this.client.resume(task.id));
      if (this.busy || this.refreshing) return;
      await this.mutate(async () => {
        // Pause immediately after the action is durably recorded in the local outbox.
        await this.client.stopTimer(task.id);
        this.pauseReasonOpen = true;
      });
      this.content.querySelector<HTMLTextAreaElement>(".pause-dialog textarea")?.focus();
    });
    timer.disabled = this.busy || this.pauseReasonOpen;
    timer.className = `timer${paused ? " is-paused" : ""}`;
    timer.id = "focus-timer";
    const svg = decorativeSvg("0 0 120 120");
    for (const className of ["timer-track", "timer-progress"]) {
      const circle = svgElement("circle", { cx: "60", cy: "60", r: String(FOCUS_RING_RADIUS), class: className });
      if (className === "timer-progress") circle.setAttribute("stroke-dasharray", String(FOCUS_RING_CIRCUMFERENCE));
      svg.append(circle);
    }
    const face = element("span", undefined, "timer-face");
    const time = element("span", "", "timer-value");
    time.id = "focus-time";
    face.append(time, element("span", paused ? "Paused · Tap to resume" : "remaining · Tap to pause", "timer-caption"));
    timer.append(svg, face);
    layout.append(timer);
    if (this.pauseReasonOpen && paused) {
      const dialog = element("dialog", undefined, "pause-dialog");
      dialog.setAttribute("aria-labelledby", "pause-reason-label");
      dialog.addEventListener("cancel", (event) => {
        // Escape may also be used to leave native fullscreen. Keep the
        // unfinished reason until the user explicitly saves or resumes.
        event.preventDefault();
      });
      const form = element("form", undefined, "pause-form");
      const label = element("label", "Why are you stopping?");
      label.id = "pause-reason-label";
      const reason = element("textarea");
      reason.required = true;
      reason.maxLength = PLANNER_LIMITS.stopReasonLength;
      reason.rows = 3;
      reason.placeholder = "e.g. Taking a break or handling an interruption";
      label.append(reason);
      const save = element("button", "Save reason");
      save.type = "submit";
      const cancel = this.button("Resume focusing", () => this.mutate(async () => {
        await this.client.resume(task.id);
        this.pauseReasonOpen = false;
      }));
      form.append(label, element("p", "The timer is paused while you write your reason.", "muted"), save, cancel);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        reason.setCustomValidity(reason.value.trim() ? "" : "Please write a reason for stopping.");
        if (!form.reportValidity()) return;
        void this.mutate(async () => {
          await this.client.savePauseReason(task.id, reason.value);
          this.pauseReasonOpen = false;
        }, form);
      });
      reason.addEventListener("input", () => reason.setCustomValidity(""));
      dialog.append(form);
      // Keep the modal outside the transformed focus layout so viewport
      // changes cannot affect its positioning in the browser.
      this.content.append(dialog);
      dialog.showModal();
      reason.focus();
    }
    const actions = element("div", undefined, "focus-actions");
    details.append(actions);
    actions.append(
      this.button("Complete task", () =>
        this.mutate(async () => {
          await this.client.complete(task.id);
          this.pauseReasonOpen = false;
          this.view = "today";
        }),
      ),
    );
  }

  private renderHabits(): void {
    const heading = element("div", undefined, "overview-heading");
    heading.append(this.account);
    this.content.append(heading);
    this.activityCalendar.update(this.data!.today, this.data!.completions);
    this.content.append(
      this.activityCalendar.element,
      this.weeklyReview.show(),
    );
    void this.weeklyReview.refresh();
  }

  private tick(): void {
    this.weeklyReview.tick();
    const timer = document.getElementById("focus-timer");
    const task: Task | null = this.data?.activeTask ?? null;
    if (timer && task) {
      const now = Math.floor((Date.now() + this.clockOffset) / 1000);
      const remaining = Math.max(0, task.estimatedMinutes * 60 - trackedSeconds(task, now));
      const displayTime = formatDuration(remaining);
      const display = document.getElementById("focus-time");
      if (display) display.textContent = displayTime;
      timer.querySelector(".timer-progress")?.setAttribute("stroke-dashoffset", String(FOCUS_RING_CIRCUMFERENCE * (1 - remaining / (task.estimatedMinutes * 60))));
      timer.setAttribute("aria-label", `${displayTime} remaining. ${task.startedAt === null ? "Paused. Click to resume" : "Click to pause"}.`);
      timer.classList.toggle("is-overdue", remaining === 0);
      const caption = timer.querySelector(".timer-caption");
      if (caption && remaining === 0 && task.startedAt !== null) caption.textContent = "Time is up · Tap to pause";
    }
  }

  private async mutate(
    action: () => Promise<unknown>,
    form?: HTMLFormElement,
  ): Promise<void> {
    if (this.busy || this.refreshing) return;
    this.busy = true;
    this.setControlsDisabled(true);
    this.error = "";
    try {
      await action();
      if (form) form.reset();
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
      // Read the local projection immediately; background sync reconciles server state.
      try {
        this.applyDashboard(await this.client.dashboard());
      } catch (error) {
        this.error = this.message(error);
      }
      // Preserve typed input on failure so it can be retried.
      if (this.error && form?.isConnected) {
        this.alert.textContent = this.error;
        this.alert.hidden = false;
        this.setControlsDisabled(false);
        if (this.data?.activeTask) {
          this.content
            .querySelectorAll<HTMLButtonElement>(".task button")
            .forEach((button) => {
              if (button.textContent === "Start focus") button.disabled = true;
            });
        }
      } else {
        this.render();
      }
    }
  }

  private setControlsDisabled(disabled: boolean): void {
    this.profileButton.disabled = disabled || this.data?.activeTask?.startedAt != null;
    this.root.querySelectorAll<HTMLButtonElement>(PLANNER_BUTTONS).forEach((button) => { button.disabled = disabled; });
    this.root.querySelectorAll('[role="slider"]').forEach((slider) => {
      if (disabled) slider.setAttribute("aria-disabled", "true");
      else slider.removeAttribute("aria-disabled");
    });
  }

  private button(label: string, action: () => void | Promise<void>): HTMLButtonElement {
    return actionButton(label, action, this.busy);
  }

  private message(error: unknown): string {
    return errorMessage(error, typeof error === "string" ? error : undefined);
  }
}

export async function startPlanner(root: HTMLElement, accountHost: HTMLElement): Promise<void> {
  const client = new PlanningClient();
  const account = await authenticate(root, client);
  await new PlanningApplication(root, client, account.email!, accountHost, account.accountKey!).mount();
}
