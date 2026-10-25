import { onMount } from "solid-js";
import { startPlanner } from "./planner/main";

export default function App() {
  let planner!: HTMLDivElement;
  onMount(() => {
    void startPlanner(planner, planner).catch(() => {
      const message = document.createElement("p");
      message.className = "error";
      message.setAttribute("role", "alert");
      message.textContent =
        "prune could not start. Reload to try again. Do not clear browser storage if you have unsynced changes.";
      planner.replaceChildren(message);
    });
  });

  return <div id="app" ref={planner} />;
}
