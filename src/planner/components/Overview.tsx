import { Show, untrack } from "solid-js";
import type { WeeklyReviewState } from "../../reviews/create-weekly-review";
import { ReviewReport } from "../../reviews/ReviewReport";
import { SAMPLE_REVIEW } from "../../reviews/sample-review";
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
        <Show
          when={!props.guest}
          fallback={
            <section class="weekly-overview overview-sample" aria-hidden="true">
              <h2>Weekly review</h2>
              <ReviewReport review={SAMPLE_REVIEW} />
            </section>
          }
        >
          <WeeklyReview review={props.review} now={planner.clock()} />
        </Show>
      </div>
      <Show when={props.guest}>
        <section
          class="overview-signin-overlay"
          aria-labelledby="overview-signin-title"
        >
          <div class="overview-signin-prompt">
            <p class="overview-signin-eyebrow">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              AI weekly analysis
            </p>
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
                <span class="overview-signin-arrow" aria-hidden="true">
                  →
                </span>
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
