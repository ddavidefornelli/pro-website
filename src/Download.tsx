import { onMount } from "solid-js";

export default function Download() {
  let downloadLink!: HTMLAnchorElement;

  onMount(() => {
    document.title = "Download prune for Mac";
    downloadLink.click();
  });

  return (
    <main class="download-page">
      <img src="/prune-logo.png" alt="prune" width="240" height="120" />
      <h1>THANK YOU FOR INSTALLING</h1>
      <a ref={downloadLink} href="/prune.dmg" download="prune.dmg" hidden>
        Download prune for Mac
      </a>
    </main>
  );
}
