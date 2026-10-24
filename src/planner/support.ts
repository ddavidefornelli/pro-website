import { element } from "./dom";
import { privacyPolicyButton } from "./privacy";

export function supportFooter(): HTMLElement {
  const footer = element("footer", undefined, "support-footer");
  const link = element("a", "fornelli.dv@gmail.com");
  link.href = "mailto:fornelli.dv@gmail.com";
  footer.append("Any problems or improvements suggestions? Contact me at: ", link, " · ", privacyPolicyButton());
  return footer;
}
