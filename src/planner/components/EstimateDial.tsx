import { createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { ESTIMATE } from "../constants";

interface EstimateDialProps {
  value: number;
  disabled?: boolean;
  class?: string;
  onChange: (minutes: number) => void | number | Promise<boolean>;
}

/** Relative turning avoids jumping when grabbed; keyboard and touch share bounds. */
export function EstimateDial(props: EstimateDialProps) {
  let dial!: HTMLDivElement;
  const initialMinutes = untrack(() => props.value);
  let position = initialMinutes;
  let previousAngle = 0;
  let pointer: number | null = null;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  const [minutes, setMinutes] = createSignal(initialMinutes);
  const [turning, setTurning] = createSignal(false);
  const clamp = (value: number) =>
    Math.max(ESTIMATE.min, Math.min(ESTIMATE.max, value));
  createEffect(() => {
    position = props.value;
    setMinutes(props.value);
  });
  const angle = (event: PointerEvent) => {
    const rect = dial.getBoundingClientRect();
    return (
      (Math.atan2(
        event.clientY - rect.top - rect.height / 2,
        event.clientX - rect.left - rect.width / 2,
      ) *
        180) /
      Math.PI
    );
  };
  const commit = () => {
    if (minutes() === props.value) return;
    // A failed local save must not leave a dial claiming an unsaved estimate.
    const result = props.onChange(minutes());
    void Promise.resolve(result).then((saved) => {
      if (saved === false && !disposed) {
        position = props.value;
        setMinutes(props.value);
      }
    });
  };
  const release = () => {
    if (pointer === null) return;
    pointer = null;
    position = minutes();
    setTurning(false);
    commit();
  };
  return (
    <div class={`estimate-control${props.class ? ` ${props.class}` : ""}`}>
      <div
        ref={(element) => (dial = element)}
        class="estimate-dial"
        classList={{ "is-turning": turning() }}
        tabIndex={0}
        role="slider"
        aria-label="Estimated time in minutes"
        aria-valuemin={ESTIMATE.min}
        aria-valuemax={ESTIMATE.max}
        aria-valuenow={minutes()}
        aria-valuetext={`${minutes()} minutes`}
        aria-disabled={props.disabled ? "true" : undefined}
        title="Turn to set minutes · 5–60 min · Arrow keys adjust by 5 min"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || props.disabled) return;
          event.preventDefault();
          dial.focus();
          pointer = event.pointerId;
          previousAngle = angle(event);
          position = minutes();
          dial.setPointerCapture(pointer);
          setTurning(true);
        }}
        onPointerMove={(event) => {
          if (props.disabled || pointer !== event.pointerId) return;
          const next = angle(event);
          const delta = ((next - previousAngle + 540) % 360) - 180;
          previousAngle = next;
          position = clamp(
            position + (delta * (ESTIMATE.max - ESTIMATE.min)) / ESTIMATE.sweep,
          );
          setMinutes(
            clamp(Math.round(position / ESTIMATE.step) * ESTIMATE.step),
          );
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(event) => {
          if (props.disabled) return;
          const adjustments: Record<string, number> = {
            ArrowUp: ESTIMATE.step,
            ArrowRight: ESTIMATE.step,
            ArrowDown: -ESTIMATE.step,
            ArrowLeft: -ESTIMATE.step,
            PageUp: 15,
            PageDown: -15,
            Home: ESTIMATE.min - minutes(),
            End: ESTIMATE.max - minutes(),
          };
          if (!(event.key in adjustments)) return;
          event.preventDefault();
          position = clamp(minutes() + adjustments[event.key]);
          setMinutes(position);
          commit();
        }}
      >
        <svg class="estimate-ring" viewBox="0 0 64 64" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r="30.5"
            pathLength={ESTIMATE.max}
            class="estimate-ring-track"
          />
          <circle
            cx="32"
            cy="32"
            r="30.5"
            pathLength={ESTIMATE.max}
            class="estimate-ring-progress"
            stroke-dasharray={`${minutes()} ${ESTIMATE.max}`}
          />
        </svg>
        <span class="dial-readout" aria-hidden="true">
          <strong>{minutes()}</strong>
        </span>
      </div>
    </div>
  );
}
