import {
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Dialog } from "../../components/Dialog";
import { ESTIMATE, MOBILE_QUERY, PLANNER_LIMITS } from "../constants";
import { EstimateDial } from "./EstimateDial";

interface TaskFormProps {
  busy: boolean;
  onCreate: (outcome: string, minutes: number) => Promise<boolean>;
}

export function TaskForm(props: TaskFormProps) {
  const [outcome, setOutcome] = createSignal("");
  const [minutes, setMinutes] = createSignal<number>(ESTIMATE.defaultMinutes);
  const [mobileMinutes, setMobileMinutes] = createSignal<number>(
    ESTIMATE.defaultMinutes,
  );
  const [mobile, setMobile] = createSignal(
    window.matchMedia(MOBILE_QUERY).matches,
  );
  const [estimating, setEstimating] = createSignal(false);
  const questionId = createUniqueId();
  let input!: HTMLInputElement;

  onMount(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const change = () => setMobile(query.matches);
    query.addEventListener("change", change);
    onCleanup(() => query.removeEventListener("change", change));
  });

  async function create(estimate: number): Promise<void> {
    if (props.busy) return;
    if (await props.onCreate(outcome(), estimate)) {
      setOutcome("");
      setMinutes(ESTIMATE.defaultMinutes);
      setMobileMinutes(ESTIMATE.defaultMinutes);
      setEstimating(false);
    }
  }

  return (
    <>
      <form
        class="task-form"
        onSubmit={(event) => {
          event.preventDefault();
          input.setCustomValidity(
            outcome().trim() ? "" : "Please write an outcome for this task.",
          );
          if (!event.currentTarget.reportValidity() || props.busy) return;
          if (mobile()) setEstimating(true);
          else void create(minutes());
        }}
      >
        <label>
          <input
            ref={(element) => {
              input = element;
            }}
            aria-label="Outcome"
            name="outcome"
            required
            maxLength={PLANNER_LIMITS.outcomeLength}
            placeholder="Add an outcome"
            value={outcome()}
            disabled={props.busy}
            onInput={(event) => {
              event.currentTarget.setCustomValidity("");
              setOutcome(event.currentTarget.value);
            }}
          />
        </label>
        <Show when={!mobile()}>
          <div class="task-estimate-inline">
            <EstimateDial
              value={minutes()}
              onChange={setMinutes}
              disabled={props.busy}
            />
          </div>
        </Show>
        <button
          type="submit"
          class="add-task"
          title="Add task"
          aria-label="Add task"
          disabled={props.busy}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v18M3 12h18" />
          </svg>
        </button>
      </form>
      <Show when={estimating()}>
        <Dialog
          class="pause-dialog task-estimate-dialog"
          aria-labelledby={questionId}
          preventCancel={props.busy}
          onDismiss={() => setEstimating(false)}
        >
          <form
            class="pause-form"
            onSubmit={(event) => {
              event.preventDefault();
              void create(mobileMinutes());
            }}
          >
            <h2 id={questionId}>
              How much time will this task take to complete?
            </h2>
            <EstimateDial
              value={mobileMinutes()}
              onChange={setMobileMinutes}
              disabled={props.busy}
            />
            <button type="submit" disabled={props.busy}>
              Add task
            </button>
            <button
              type="button"
              disabled={props.busy}
              onClick={() => setEstimating(false)}
            >
              Cancel
            </button>
          </form>
        </Dialog>
      </Show>
    </>
  );
}
