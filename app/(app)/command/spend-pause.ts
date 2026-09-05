import { getCurrentProfile } from "@/lib/auth";
import { getRepo } from "@/lib/data";

/**
 * The Command Center kill switch: "Pause all external agent spending".
 *
 * ## Why the wallet row and not a cookie
 *
 * The pause has to be **server state**, and it has to be the *same* state the
 * money path reads. An httpOnly cookie was neither: a second browser showed the
 * switch as "Live" while the clamp it had written was still pinning the daily
 * ceiling, and pausing twice overwrote the remembered ceiling with the clamped
 * value, so resuming restored one cent a day for good.
 *
 * So the flag lives on `wallets.autonomous_paused`, and `holdFunds` refuses
 * every unattended hold while it is set — the site's own autonomous paths
 * (@World's "Assemble & run"), an API key, and an MCP client alike. Nothing is
 * clamped and nothing has to be restored, so the switch and the limit it
 * enforces cannot disagree. The wallet's `approval_threshold_cents` and daily
 * ceiling keep working underneath either way.
 */

export async function isSpendPaused(): Promise<boolean> {
  try {
    const repo = getRepo();
    const profile = await getCurrentProfile(repo);
    if (!profile) return false;
    const wallet = await repo.getWallet(profile.id);
    return wallet?.autonomous_paused ?? false;
  } catch {
    return false;
  }
}
