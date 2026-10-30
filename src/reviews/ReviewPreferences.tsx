import { createSignal, Show, untrack } from "solid-js";
import { PrivacyPolicyButton } from "../components/PrivacyPolicyButton";
import type { WeeklyReviewState } from "./create-weekly-review";
import { reviewDate } from "./format";

export function ReviewPreferences(props: {
  review: WeeklyReviewState;
  disabled: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const review = untrack(() => props.review);
  return (
    <section class="review-preferences" aria-busy={review.saving()}>
      <Show when={review.error()}>
        <p class="error" role="alert">
          {review.error()}
        </p>
        <button
          type="button"
          disabled={review.saving() || props.disabled}
          onClick={() => {
            void review.refresh();
          }}
        >
          Retry loading
        </button>
      </Show>
      <Show
        when={review.data()}
        fallback={<p class="muted">Loading AI settings…</p>}
      >
        {(data) => (
          <details
            class="weekly-settings"
            open={open()}
            onToggle={(event) => setOpen(event.currentTarget.open)}
          >
            <summary>Weekly review settings</summary>
            <p class="muted">
              Weekly reviews run automatically using selected planner activity
              processed by OpenAI. While they are on, Today and Tomorrow also
              suggest tasks from the previous day's plan. Turning reviews off
              stops both, without affecting tasks or timers. See the Privacy
              Policy for data, provider and retention details.
            </p>
            <PrivacyPolicyButton />
            <p class="muted">
              Model: {data().model} · Hosted AI{" "}
              {data().available ? "enabled" : "temporarily unavailable"}
            </p>
            <button
              type="button"
              disabled={review.saving() || props.disabled}
              onClick={() => {
                void review.setEnabled(!data().settings.enabled).then(() => {
                  if (!review.error() && review.data()?.settings.enabled)
                    setOpen(false);
                });
              }}
            >
              {data().settings.enabled
                ? "Turn off weekly reviews"
                : "Turn on weekly reviews"}
            </button>
            <p class="muted">
              Reviews appear Sunday at 4:00 p.m. in your local timezone while
              prune is open, or at the next launch.
            </p>
            <Show when={data().settings.enabled}>
              <p class="muted">
                Next scheduled update: {reviewDate(data().week.nextUpdate)} at
                4:00 p.m. local time.{" "}
                {data().developmentUnlimited
                  ? "Development mode: no request cooldown or usage cap."
                  : "Failed requests retry at most hourly; successful reviews are not regenerated."}
              </p>
            </Show>
          </details>
        )}
      </Show>
    </section>
  );
}
