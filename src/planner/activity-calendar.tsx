import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  splitProps,
  type JSX,
} from "solid-js";
import {
  calendarYear,
  MONTHS,
  type CalendarDay,
  type CalendarYear,
  type Completion,
} from "./activity-calendar-model";

export interface ActivityCalendarProps {
  today: string;
  completions: readonly Completion[];
}

const dateLabel = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** A reusable intensity swatch, shared by the chart and its legend. */
export function ActivitySwatch(
  props: { count: number } & JSX.HTMLAttributes<HTMLSpanElement>,
) {
  const [local, attributes] = splitProps(props, ["count", "class"]);
  return (
    <span
      {...attributes}
      class={`activity-day activity-level-${Math.min(local.count, 3)}${local.class ? ` ${local.class}` : ""}`}
    />
  );
}

export function ActivityLegend() {
  return (
    <div
      class="activity-legend"
      aria-label="Daily completions: no tasks, one task, two tasks, three or more tasks"
    >
      <span>Less</span>
      <For each={[0, 1, 2, 3]}>
        {(level) => <ActivitySwatch count={level} aria-hidden="true" />}
      </For>
      <span>More</span>
    </div>
  );
}

function ActivityDay(props: {
  day: CalendarDay;
  today: string;
  tabIndex: number;
}) {
  const label = createMemo(() => {
    const formatted = dateLabel.format(new Date(`${props.day.day}T00:00:00Z`));
    return props.day.future
      ? `${formatted} — upcoming`
      : `${props.day.count} ${props.day.count === 1 ? "task" : "tasks"} completed on ${formatted}`;
  });
  return (
    <ActivitySwatch
      count={props.day.count}
      class={`${props.day.future ? "is-future" : ""}${props.day.day === props.today ? " is-today" : ""}`}
      style={{
        "grid-row": props.day.row + 2,
        "grid-column": props.day.week + 1,
      }}
      title={label()}
      role="listitem"
      aria-label={label()}
      aria-current={props.day.day === props.today ? "date" : undefined}
      tabIndex={props.day.future ? undefined : props.tabIndex}
    />
  );
}

/** Owns roving focus; date calculation and day presentation stay independent. */
export function ActivityGrid(props: {
  calendar: CalendarYear;
  today: string;
  startMonth: number;
  labelledBy: string;
}) {
  const [focusedDay, setFocusedDay] = createSignal<string>();
  const available = createMemo(() =>
    props.calendar.days.filter((day) => !day.future),
  );
  const tabStop = createMemo(() => {
    const days = available();
    return (
      days.find((day) => day.day === focusedDay())?.day ?? days.at(-1)?.day
    );
  });
  const months = createMemo(() =>
    Array.from({ length: 12 }, (_, index) => {
      const month = (props.startMonth + index) % 12;
      const first = props.calendar.days.find((day) => day.month === month)!;
      const next =
        index < 11
          ? props.calendar.days.find((day) => day.month === (month + 1) % 12)
          : undefined;
      return {
        month,
        week: first.week,
        span: (next?.week ?? props.calendar.weeks) - first.week,
      };
    }),
  );
  const navigate: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    const cells = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "[role=listitem][tabindex]",
      ),
    );
    const index = cells.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const delta = (
      { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 } as Record<
        string,
        number
      >
    )[event.key];
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? cells.length - 1
          : delta === undefined
            ? null
            : Math.max(0, Math.min(cells.length - 1, index + delta));
    if (next === null) return;
    event.preventDefault();
    setFocusedDay(available()[next].day);
    cells[next].focus();
  };
  return (
    <div
      class="activity-grid"
      style={{ "--weeks": props.calendar.weeks }}
      role="list"
      aria-labelledby={props.labelledBy}
      onKeyDown={navigate}
    >
      <For each={months()}>
        {(month) => (
          <span
            class="activity-month"
            style={{ "grid-column": `${month.week + 1} / span ${month.span}` }}
            aria-hidden="true"
          >
            {MONTHS[month.month]}
          </span>
        )}
      </For>
      <For each={props.calendar.days}>
        {(day) => (
          <ActivityDay
            day={day}
            today={props.today}
            tabIndex={day.day === tabStop() ? 0 : -1}
          />
        )}
      </For>
    </div>
  );
}

export function ActivityCalendar(props: ActivityCalendarProps) {
  const headingId = createUniqueId();
  const year = () => Number(props.today.slice(0, 4));
  const startMonth = () => Number(props.today.slice(5, 7)) - 1;
  const calendar = createMemo(() =>
    calendarYear(year(), props.today, props.completions, startMonth()),
  );
  const heading = () =>
    `${calendar().total.toLocaleString()} ${calendar().total === 1 ? "task" : "tasks"} completed in ${MONTHS[startMonth()]} ${year()} – ${MONTHS[(startMonth() + 11) % 12]} ${startMonth() === 0 ? year() : year() + 1}`;
  return (
    <section class="activity-calendar" aria-label="Task completion history">
      <div class="activity-chart">
        <h2 class="activity-heading" id={headingId}>
          {heading()}
        </h2>
        <div class="activity-card">
          <div class="activity-scroll">
            <ActivityGrid
              calendar={calendar()}
              today={props.today}
              startMonth={startMonth()}
              labelledBy={headingId}
            />
          </div>
          <div class="activity-footer">
            <ActivityLegend />
          </div>
        </div>
      </div>
    </section>
  );
}
