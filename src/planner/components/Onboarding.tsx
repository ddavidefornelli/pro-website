import { createSignal, createUniqueId, For, Show } from "solid-js";
import { Dialog } from "../../components/Dialog";
import { ESTIMATE, PLANNER_LIMITS } from "../constants";
import { errorMessage } from "../errors";
import { onboardingKey } from "../onboarding";
import { EstimateDial } from "./EstimateDial";

interface OnboardingProps {
  accountKey: string;
  onCreate: (outcome: string, minutes: number) => Promise<void>;
  onDismiss: () => void;
  onCreated: () => void;
}

export function Onboarding(props: OnboardingProps) {
  const [step, setStep] = createSignal(1);
  const [outcome, setOutcome] = createSignal("");
  const [minutes, setMinutes] = createSignal<number>(ESTIMATE.defaultMinutes);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const headingId = createUniqueId();
  const remember = () => {
    try {
      localStorage.setItem(onboardingKey(props.accountKey), "done");
    } catch {
      /* Onboarding does not depend on persistence. */
    }
  };
  const dismiss = () => {
    if (busy()) return;
    remember();
    props.onDismiss();
  };
  async function create(): Promise<void> {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await props.onCreate(outcome(), minutes());
      remember();
      props.onCreated();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      class="first-task-dialog"
      aria-labelledby={headingId}
      onDismiss={dismiss}
      preventCancel={busy()}
      initialFocus={(dialog) => dialog.querySelector("input")?.focus()}
    >
      <div class="onboarding-top">
        <span class="onboarding-eyebrow">{step()} OF 2</span>
        <button type="button" disabled={busy()} onClick={dismiss}>
          Skip for now
        </button>
      </div>
      <div class="onboarding-progress" aria-hidden="true">
        <For each={[1, 2]}>
          {(index) => <span classList={{ "is-done": index <= step() }} />}
        </For>
      </div>
      <h1 id={headingId} tabIndex={-1}>
        {step() === 1
          ? "Start with one small win."
          : "Make a little space for it."}
      </h1>
      <p class="muted">
        {step() === 1
          ? "What’s one thing you’d like to finish today?"
          : "Choose a realistic estimate. A small, focused session is a great place to start."}
      </p>
      <form
        class="onboarding-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (step() === 2) {
            void create();
            return;
          }
          const input = event.currentTarget.querySelector("input")!;
          input.setCustomValidity(
            outcome().trim() ? "" : "Write one thing you’d like to finish.",
          );
          if (!event.currentTarget.reportValidity()) return;
          setOutcome(outcome().trim());
          setStep(2);
        }}
      >
        <Show
          when={step() === 1}
          fallback={
            <>
              <p class="onboarding-outcome">{outcome()}</p>
              <div class="onboarding-estimate">
                <EstimateDial
                  value={minutes()}
                  onChange={setMinutes}
                  disabled={busy()}
                />
                <p class="muted">Minutes of focus</p>
              </div>
              <p class="onboarding-hint">
                Turn the dial or use the arrow keys · 5–60 minutes
              </p>
            </>
          }
        >
          <input
            aria-label="Task outcome"
            placeholder="e.g. Write the first draft of my proposal"
            required
            maxLength={PLANNER_LIMITS.outcomeLength}
            value={outcome()}
            onInput={(event) => {
              event.currentTarget.setCustomValidity("");
              setOutcome(event.currentTarget.value);
            }}
          />
        </Show>
        <p class="error" role="alert" hidden={!error()}>
          {error()}
        </p>
        <div class="onboarding-actions">
          <Show when={step() === 2}>
            <button type="button" disabled={busy()} onClick={() => setStep(1)}>
              Back
            </button>
          </Show>
          <button type="submit" disabled={busy()}>
            {step() === 1
              ? "Next: set a time estimate"
              : busy()
                ? "Creating…"
                : "Create my first task"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
