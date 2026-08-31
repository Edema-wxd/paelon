import { serverEnv } from "@/lib/env";

/**
 * WhatsApp provider abstraction (backend spec §11).
 *
 * Provider undecided (master spec §18), so the abstraction is built and nothing
 * is implemented. `WHATSAPP_PROVIDER` selects one; empty or unknown resolves to
 * the no-op, which is the Phase 1 state.
 */

export interface WhatsAppResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

export interface WhatsAppProvider {
  name: string;
  sendTemplate(
    to: string,
    template: string,
    vars: Record<string, string>,
  ): Promise<WhatsAppResult>;
}

const noopProvider: WhatsAppProvider = {
  name: "noop",
  async sendTemplate(): Promise<WhatsAppResult> {
    return { success: false, skipped: true, error: "not_configured" };
  },
};

/** Resolve the configured provider. Unknown or empty gives the no-op. */
export function getWhatsAppProvider(): WhatsAppProvider {
  const configured = serverEnv().WHATSAPP_PROVIDER;
  if (!configured) return noopProvider;

  // TODO(francis): no provider selected yet (master spec §18). Add the concrete
  // implementation here once one is chosen; note that outbound business-initiated
  // messages need pre-approved templates, which takes days to arrange.
  return noopProvider;
}

/**
 * Build a `wa.me` deep link. Needs no provider, so it ships in Phase 1 for the
 * contact page and the emergency block.
 */
export function whatsAppDeepLink(
  phoneE164: string,
  greeting?: string,
): string {
  const number = phoneE164.replace(/\D/g, "");
  const query = greeting ? `?text=${encodeURIComponent(greeting)}` : "";
  return `https://wa.me/${number}${query}`;
}
