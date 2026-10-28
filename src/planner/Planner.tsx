import {
  createEffect,
  createSignal,
  Match,
  Show,
  Switch,
  untrack,
} from "solid-js";
import PixelBackground from "../components/PixelBackground";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Profile } from "../profile/Profile";
import { WeeklyReview } from "../reviews/WeeklyReview";
import { createWeeklyReview } from "../reviews/create-weekly-review";
import type { PlanningClient } from "./api";
import { ActivityCalendar } from "./components/ActivityCalendar";
import { FocusView } from "./components/FocusView";
import { Onboarding } from "./components/Onboarding";
import { PlanView } from "./components/PlanView";
import { PlannerNavigation } from "./components/PlannerNavigation";
import { PlannerTour } from "./components/PlannerTour";
import { VIEW_LABELS } from "./constants";
import { createPlanner } from "./create-planner";
import { shouldOfferOnboarding } from "./onboarding";
import type { Account } from "./types";

export function Planner(props: { client: PlanningClient; account: Account }) {
  let root!: HTMLDivElement;
  const client = untrack(() => props.client);
  const planner = createPlanner(client);
  const review = createWeeklyReview(
    client,
    () => planner.view() === "habits" || planner.view() === "profile",
  );
  const [onboarding, setOnboarding] = createSignal(false);
  const [tour, setTour] = createSignal(false);
  let onboardingChecked = false;
  let firstTaskId: string | null = null;
  let previousView = planner.view();

  async function createFirstTask(
    outcome: string,
    minutes: number,
  ): Promise<void> {
    const success = await planner.mutate(async () => {
      const task = await client.create(outcome, planner.data()!.today, minutes);
      firstTaskId = task.id;
      planner.visit("today");
    });
    if (!success) throw new Error(planner.error());
  }

  async function startFirstTask(): Promise<void> {
    const id = firstTaskId;
    if (!id) return;
    const success = await planner.mutate(async () => {
      await client.start(id);
      planner.visit("focus");
    });
    if (!success) throw new Error(planner.error());
  }

  createEffect(() => {
    const data = planner.data();
    if (!data || onboardingChecked) return;
    onboardingChecked = true;
    setOnboarding(
      shouldOfferOnboarding(data, props.account.accountKey, localStorage),
    );
  });
  createEffect(() => {
    const view = planner.view();
    if (view !== previousView) window.scrollTo(0, 0);
    previousView = view;
  });

  return (
    <>
      <PixelBackground completionLevel={planner.completionLevel()} />
      <div
        id="app"
        ref={(element) => {
          root = element;
        }}
        data-view={planner.view()}
        data-completion-level={planner.completionLevel()}
      >
        <PlannerNavigation planner={planner} />
        <div class="sync-bar" hidden={!planner.syncBlocked()}>
          <span role="alert">
            {planner.syncBlocked()
              ? "Some recent changes could not be applied. They are kept on this device until you discard them."
              : ""}
          </span>
          <button
            type="button"
            disabled={planner.busy()}
            onClick={() => {
              void planner.discardPending();
            }}
          >
            Discard rejected changes
          </button>
        </div>
        <p class="error" role="alert" hidden={!planner.error()}>
          {planner.error()}
        </p>
        <main id="planner-content" aria-label={VIEW_LABELS[planner.view()]}>
          <Show
            when={planner.data()}
            fallback={
              <Show when={planner.error()} fallback={<LoadingIndicator />}>
                <button
                  type="button"
                  onClick={() => {
                    void planner.refresh();
                  }}
                >
                  Retry
                </button>
              </Show>
            }
          >
            <Switch>
              <Match when={planner.view() === "profile"}>
                <Profile
                  email={props.account.email}
                  planner={planner}
                  review={review}
                />
              </Match>
              <Match when={planner.view() === "focus"}>
                <FocusView planner={planner} client={props.client} />
              </Match>
              <Match when={planner.view() === "habits"}>
                <div class="overview-actions">
                  <button
                    type="button"
                    class="profile-button"
                    aria-label="Profile"
                    aria-controls="planner-content"
                    title="Profile"
                    disabled={planner.busy() || planner.focusLocked()}
                    onClick={() => planner.visit("profile")}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                    </svg>
                  </button>
                </div>
                <ActivityCalendar
                  today={planner.data()!.today}
                  completions={planner.data()!.completions}
                />
                <WeeklyReview review={review} now={planner.clock()} />
              </Match>
              <Match
                when={
                  planner.view() === "today" || planner.view() === "tomorrow"
                }
              >
                <PlanView planner={planner} client={props.client} />
              </Match>
            </Switch>
          </Show>
        </main>
        <Show when={onboarding()}>
          <Onboarding
            accountKey={props.account.accountKey}
            onDismiss={() => setOnboarding(false)}
            onCreate={createFirstTask}
            onCreated={() => {
              setOnboarding(false);
              setTour(true);
            }}
          />
        </Show>
        <Show when={tour()}>
          <PlannerTour
            host={root}
            onVisit={planner.visit}
            onDone={(started) => {
              setTour(false);
              if (!started) planner.visit("today");
            }}
            onStart={startFirstTask}
          />
        </Show>
      </div>
    </>
  );
}
