import { element } from "./dom";
import { privacyPolicyButton } from "./privacy";

export function supportFooter(): HTMLElement {
  const footer = element("footer", undefined, "support-footer");
  const link = element("a", "fornelli.dv@gmail.com");
  link.href = "mailto:fornelli.dv@gmail.com";
  footer.append("Need a hand? ", link, " · ", privacyPolicyButton());
  return footer;
}
