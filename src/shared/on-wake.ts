import { onCleanup, onMount } from "solid-js";

/** Refresh only when the page is visible; listeners belong to the Solid owner. */
export function onWake(callback: () => void): void {
  onMount(() => {
    const wake = () => {
      if (document.visibilityState !== "hidden") callback();
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    onCleanup(() => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    });
  });
}
