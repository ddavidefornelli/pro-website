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
    <div class="overview-screen" classList={{ "is-guest": props.guest }}>
      <div class="overview-content" inert={props.guest ? true : undefined}>
        <div class="overview-actions">
          <button
            type="button"
            class="profile-button"
            aria-controls="planner-content"
            disabled={planner.busy() || planner.focusLocked()}
            onClick={() => planner.visit("profile")}
          >
            Profile
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
              KNOW WHAT'S
              <br />
              HOLDING YOU <em>BACK.</em>
            </h2>
            <p class="overview-signin-description">
              Sign in to get a free AI review of your week, synced across your
              devices.
            </p>
            <ul class="overview-signin-includes">
              <li>Stop patterns</li>
              <li>Estimate vs actual</li>
              <li>Suggestions for next week</li>
            </ul>
            <div class="overview-signin-actions">
              <button
                type="button"
                class="overview-signin-primary"
                onClick={() => props.onSignIn?.()}
              >
                Sign in
              </button>
              <button
                type="button"
                class="overview-signin-secondary"
                onClick={() => planner.visit("profile")}
              >
                Profile
              </button>
            </div>
          </div>
        </section>
      </Show>
    </div>
  );
}
