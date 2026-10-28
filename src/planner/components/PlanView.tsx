import { For, Show, untrack } from "solid-js";
import type { PlanningClient } from "../api";
import { PLANNER_LIMITS } from "../constants";
import type { PlannerState } from "../create-planner";
import { formatDuration } from "../time";
import { EstimateDial } from "./EstimateDial";
import { TaskForm } from "./TaskForm";
import { TaskTitle } from "./TaskTitle";

export function PlanView(props: {
  planner: PlannerState;
  client: PlanningClient;
}) {
  const planner = untrack(() => props.planner);
  const tomorrow = () => planner.view() === "tomorrow";
  const tasks = () =>
    (tomorrow() ? planner.data()?.tomorrowTasks : planner.data()?.todayTasks) ??
    [];
  const day = () =>
    (tomorrow() ? planner.data()?.tomorrow : planner.data()?.today) ?? "";
  const dayLabel = () => {
    const [year, month, date] = day().split("-");
    return `${date}/${month}/${year?.slice(-2)}`;
  };

  return (
    <>
      <div class="plan-heading">
        <time class="plan-date" dateTime={day()}>
          {dayLabel()}
        </time>
      </div>
      <ul class="task-list">
        <For each={tasks()}>
          {(task) => (
            <li
              class="task"
              classList={{
                "is-completed": !tomorrow() && task.status === "completed",
              }}
            >
              <div class="task-details">
                <TaskTitle
                  task={task}
                  heading="h2"
                  editable={task.status === "planned"}
                  disabled={planner.busy()}
                  onRename={(outcome) =>
                    planner.mutate(() => props.client.rename(task.id, outcome))
                  }
                />
                <Show
                  when={
                    task.status === "completed" ||
                    (tomorrow() && task.status !== "planned")
                  }
                >
                  <p class="muted">
                    {task.status === "completed"
                      ? `${formatDuration(task.actualSeconds)} · completed`
                      : `${task.estimatedMinutes} min estimated · ${task.status}`}
                  </p>
                </Show>
              </div>
              <Show when={task.status === "planned"}>
                <EstimateDial
                  class="task-estimate"
                  value={task.estimatedMinutes}
                  disabled={planner.busy()}
                  onChange={(minutes) =>
                    planner.mutate(() =>
                      props.client.changeEstimate(task.id, minutes),
                    )
                  }
                />
              </Show>
              <Show when={!tomorrow() && task.status === "planned"}>
                <button
                  type="button"
                  disabled={planner.busy() || !!planner.data()?.activeTask}
                  onClick={() => {
                    void planner.mutate(async () => {
                      await props.client.start(task.id);
                      planner.visit("focus");
                    });
                  }}
                >
                  Start focus
                </button>
              </Show>
              <Show when={task.status === "active"}>
                <button
                  type="button"
                  disabled={planner.busy()}
                  onClick={() => planner.visit("focus")}
                >
                  Return to focus
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={tasks().length < PLANNER_LIMITS.tasksPerDay}>
        <TaskForm
          busy={planner.busy()}
          onCreate={(outcome, minutes) =>
            planner.mutate(() => props.client.create(outcome, day(), minutes))
          }
        />
      </Show>
    </>
  );
}
