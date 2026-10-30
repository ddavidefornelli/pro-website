import { onCleanup, onMount, splitProps, type JSX } from "solid-js";

interface DialogProps extends JSX.DialogHtmlAttributes<HTMLDialogElement> {
  onDismiss: () => void;
  initialFocus?: (dialog: HTMLDialogElement) => void;
  preventCancel?: boolean;
}

/** Native modality and focus restoration, owned by the component lifecycle. */
export function Dialog(props: DialogProps) {
  const [local, attributes] = splitProps(props, [
    "children",
    "onDismiss",
    "initialFocus",
    "preventCancel",
  ]);
  let dialog!: HTMLDialogElement;

  onMount(() => {
    const opener = document.activeElement;
    dialog.showModal();
    local.initialFocus?.(dialog);
    onCleanup(() => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    });
  });

  return (
    <dialog
      {...attributes}
      ref={(element) => (dialog = element)}
      onCancel={(event) => {
        event.preventDefault();
        if (!local.preventCancel) local.onDismiss();
      }}
    >
      {local.children}
    </dialog>
  );
}
