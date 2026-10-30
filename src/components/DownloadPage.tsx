import { onMount } from "solid-js";
import { MAC_DOWNLOAD } from "../shared/site";

export function DownloadPage() {
  let download!: HTMLAnchorElement;
  onMount(() => download.click());
  return (
    <main class="download-page">
      <h1>THANK YOU FOR INSTALLING</h1>
      <p>Your Mac download should start automatically.</p>
      <a
        ref={(element) => (download = element)}
        href={MAC_DOWNLOAD.href}
        download={MAC_DOWNLOAD.filename}
      >
        Download again
      </a>
    </main>
  );
}
