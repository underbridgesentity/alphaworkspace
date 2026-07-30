import { isShellRequest } from "@/server/shell";
import { BillingSettingsPage } from "./billing-client";
import { ShellPlanFacts } from "./shell-plan-facts";

/**
 * Server gate for the billing surface. The store shell (Capacitor webview,
 * detected from its UA marker) must never receive prices, band cards,
 * checkout or cancellation in the DOM, so the branch happens here on the
 * server: a shell request renders only the plan-name facts and the real
 * billing component is never part of the payload. The web keeps the full
 * billing page untouched.
 */
export default async function Page() {
  if (await isShellRequest()) return <ShellPlanFacts />;
  return <BillingSettingsPage />;
}
