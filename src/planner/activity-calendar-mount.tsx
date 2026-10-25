import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { ActivityCalendar, type ActivityCalendarProps } from "./activity-calendar";

/** Temporary boundary for DOM-based views. Solid consumers use ActivityCalendar directly.
 * The caller owns the root: reuse its element across views, or dispose before discarding it.
 */
export function createActivityCalendar() {
  const element = document.createElement("div");
  const [props, setProps] = createSignal<ActivityCalendarProps>();
  const dispose = render(() => (
    <Show when={props()}>{(value) => <ActivityCalendar today={value().today} completions={value().completions} />}</Show>
  ), element);
  return {
    element,
    update(today: string, completions: ActivityCalendarProps["completions"]) {
      setProps({ today, completions });
    },
    dispose,
  };
}
