import { isAllowedWebhookUrl } from "@/lib/runtime";
import { ValidationError } from "./errors";
import type { AgentEndpoints } from "./types";

/**
 * `agents.endpoints` is creator-supplied text that the runtime may later POST
 * to (`endpoints.webhook`, BUILD_SPEC §6), so it is validated on write rather
 * than at run time: HTTPS only, no embedded credentials, and no loopback,
 * link-local, cloud-metadata or private-range host.
 *
 * Without this a creator could register an agent pointing at
 * `http://169.254.169.254/…` and have the District's own server fetch it.
 */
export function validateAgentEndpoints(endpoints: AgentEndpoints | undefined): AgentEndpoints {
  const value = endpoints ?? {};
  for (const [key, url] of Object.entries(value)) {
    if (!url) continue;
    if (!isAllowedWebhookUrl(url)) {
      throw new ValidationError(`endpoints.${key} must be an https:// URL on a public host`);
    }
  }
  return value;
}
