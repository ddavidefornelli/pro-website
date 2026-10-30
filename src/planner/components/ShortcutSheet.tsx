import { createUniqueId, For } from "solid-js";
import { Dialog } from "../../components/Dialog";
import { SHORTCUTS } from "../shortcuts";

export function ShortcutSheet(props: { onDismiss: () => void }) {
  const titleId = createUniqueId();
  return (
    <Dialog
      class="pause-dialog shortcut-sheet"
      aria-labelledby={titleId}
      onDismiss={() => props.onDismiss()}
    >
      <div class="pause-form">
        <h2 id={titleId}>Keyboard shortcuts</h2>
        <dl>
          <For each={SHORTCUTS}>
            {(shortcut) => (
              <div>
                <dt>{shortcut.label}</dt>
                <dd>
                  <kbd>{shortcut.key}</kbd>
                </dd>
              </div>
            )}
          </For>
        </dl>
        <button type="button" onClick={() => props.onDismiss()}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
