import { Show, untrack } from "solid-js";
import type { WeeklyReviewState } from "../../reviews/create-weekly-review";
import { WeeklyReview } from "../../reviews/WeeklyReview";
import type { PlannerState } from "../create-planner";
import { ActivityCalendar } from "./ActivityCalendar";

export function Overview(props: {
  planner: PlannerState;
  review: WeeklyReviewState;
  guest?: boolean;
  onSignIn?: () => void;
}) {
  const planner = untrack(() => props.planner);
  return (
    <div class="overview-screen">
      <div class="overview-content" inert={props.guest ? true : undefined}>
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
        <Show when={!props.guest}>
          <WeeklyReview review={props.review} now={planner.clock()} />
        </Show>
      </div>
      <Show when={props.guest}>
        <section
          class="overview-signin-overlay"
          aria-labelledby="overview-signin-title"
        >
          <div class="overview-signin-prompt">
            <h2 id="overview-signin-title">
              AI weekly analysis is available only when you sign in.
            </h2>
            <button type="button" onClick={() => props.onSignIn?.()}>
              Sign in
            </button>
            <button type="button" onClick={() => planner.visit("profile")}>
              Profile
            </button>
          </div>
        </section>
      </Show>
    </div>
  );
}
