import { element } from "./dom";
import { privacyPolicyButton } from "./privacy";

export function supportFooter(): HTMLElement {
  const footer = element("footer", undefined, "support-footer");
  footer.append(privacyPolicyButton());
  return footer;
}
