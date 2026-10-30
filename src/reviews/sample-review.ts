import type { WeeklyReview } from "../planner/types";

/** Illustrative report shown behind the guest sign-in prompt; never sent anywhere. */
export const SAMPLE_REVIEW: WeeklyReview = {
  weekStart: "2026-01-05",
  weekEnd: "2026-01-11",
  generatedAt: 0,
  model: "sample",
  activity: {
    tasks: [
      {
        id: "sample-1",
        outcome: "Draft the project proposal",
        plannedFor: "2026-01-05",
        completedOn: "2026-01-05",
        status: "completed",
        estimatedMinutes: 60,
        actualSeconds: 5400,
      },
      {
        id: "sample-2",
        outcome: "Clear my inbox",
        plannedFor: "2026-01-06",
        completedOn: "2026-01-06",
        status: "completed",
        estimatedMinutes: 20,
        actualSeconds: 2100,
      },
      {
        id: "sample-3",
        outcome: "Plan the week ahead",
        plannedFor: "2026-01-08",
        completedOn: "2026-01-08",
        status: "completed",
        estimatedMinutes: 30,
        actualSeconds: 1800,
      },
    ],
    stops: [
      {
        id: 1,
        taskId: "sample-1",
        reason: "Slack notifications",
        stoppedOn: "2026-01-05",
      },
      {
        id: 2,
        taskId: "sample-1",
        reason: "Checked email",
        stoppedOn: "2026-01-05",
      },
      { id: 3, taskId: "sample-2", reason: "Phone", stoppedOn: "2026-01-06" },
      {
        id: 4,
        taskId: "sample-3",
        reason: "Unclear next step",
        stoppedOn: "2026-01-08",
      },
    ],
    totalStops: 4,
    omittedStops: 0,
  },
  analysis: {
    summary: "",
    mainReasons: [
      {
        reason: "Messages pulling you out of focus",
        evidenceStopIds: [1, 2, 3],
      },
      {
        reason: "Tasks starting without a clear first step",
        evidenceStopIds: [4],
      },
    ],
    improvements: [
      "Silence notifications during your first focus block.",
      "Write the first concrete step before starting a task.",
      "Pad estimates for writing tasks by about 30%.",
    ],
  },
};
