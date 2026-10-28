import { createSignal, createUniqueId, For, Show } from "solid-js";
import policy from "../../PRIVACY.md?raw";
import { Dialog } from "./Dialog";

type PolicyBlock =
  | { kind: "heading" | "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/** Deliberately limited Markdown, rendered as text; never interpret raw HTML. */
function parsePolicy(source: string): PolicyBlock[] {
  const blocks: PolicyBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | undefined;
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("# ")) continue;
    if (!line.trim()) {
      flush();
      list = undefined;
    } else if (line.startsWith("## ")) {
      flush();
      list = undefined;
      blocks.push({ kind: "heading", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      flush();
      if (!list) {
        list = [];
        blocks.push({ kind: "list", items: list });
      }
      list.push(line.slice(2));
    } else {
      list = undefined;
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const blocks = parsePolicy(policy);
const isDraft =
  policy.includes("[TO COMPLETE:") || /^Status: Draft\b/m.test(policy);

export function PrivacyPolicyButton(props: { label?: string }) {
  const [open, setOpen] = createSignal(false);
  const titleId = createUniqueId();
  return (
    <>
      <button
        type="button"
        class="privacy-policy-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {props.label ?? "Terms & Privacy"}
      </button>
      <Show when={open()}>
        <Dialog
          class="privacy-dialog"
          aria-labelledby={titleId}
          onDismiss={() => setOpen(false)}
          initialFocus={(dialog) =>
            dialog.querySelector<HTMLButtonElement>("button")?.focus()
          }
        >
          <header class="privacy-dialog-header">
            <h2 id={titleId}>Terms & Privacy</h2>
            <button type="button" onClick={() => setOpen(false)}>
              Close privacy policy
            </button>
          </header>
          <Show when={isDraft}>
            <p class="privacy-template-warning">
              Draft policy. Operator details and deployed services still require
              review before public release.
            </p>
          </Show>
          <article
            class="privacy-policy-content"
            tabIndex={0}
            aria-label="Full terms and privacy policy"
          >
            <For each={blocks}>
              {(block) =>
                block.kind === "list" ? (
                  <ul>
                    <For each={block.items}>{(item) => <li>{item}</li>}</For>
                  </ul>
                ) : block.kind === "heading" ? (
                  <h3>{block.text}</h3>
                ) : (
                  <p>{block.text}</p>
                )
              }
            </For>
          </article>
        </Dialog>
      </Show>
    </>
  );
}
