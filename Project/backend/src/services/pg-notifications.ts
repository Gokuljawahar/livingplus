// WhatsApp Cloud API (spec Tier 2) and UPI gateway are optional modules.
// Both stay disabled unless explicitly enabled, so the platform works
// in offline mode (wa.me click-to-chat + manual ledger) without them.

export const featureFlags = {
  whatsappCloudApi: process.env.ENABLE_WHATSAPP_CLOUD_API === 'true',
  upiPayment: process.env.ENABLE_UPI_PAYMENT === 'true'
};

export type WhatsAppEvent =
  | 'BOOKING_RECEIVED'
  | 'BOOKING_APPROVED'
  | 'BOOKING_REJECTED'
  | 'CHECK_IN_REMINDER'
  | 'RENT_DUE';

const TEMPLATE_BY_EVENT: Record<WhatsAppEvent, string> = {
  BOOKING_RECEIVED: 'pg_booking_received',
  BOOKING_APPROVED: 'pg_booking_approved',
  BOOKING_REJECTED: 'pg_booking_rejected',
  CHECK_IN_REMINDER: 'pg_check_in_reminder',
  RENT_DUE: 'pg_rent_due'
};

export type WhatsAppResult =
  | { sent: true }
  | { sent: false; skipped: 'disabled' | 'not-configured' | 'no-recipient' };

export async function notifyWhatsAppTemplate(
  event: WhatsAppEvent,
  toPhone: string | null | undefined,
  parameters: string[] = []
): Promise<WhatsAppResult> {
  if (!featureFlags.whatsappCloudApi) return { sent: false, skipped: 'disabled' };

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return { sent: false, skipped: 'not-configured' };

  const to = String(toPhone || '').replace(/\D/g, '');
  if (!to) return { sent: false, skipped: 'no-recipient' };

  const version = process.env.WHATSAPP_VERSION || 'v21.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: TEMPLATE_BY_EVENT[event],
        language: { code: 'en' },
        ...(parameters.length
          ? { components: [{ type: 'body', parameters: parameters.map((text) => ({ type: 'text', text })) }] }
          : {})
      }
    })
  });
  if (!response.ok) {
    throw new Error(`WhatsApp template send failed: ${response.status}`);
  }
  return { sent: true };
}

// Fire-and-forget wrapper: notifications must never break a booking flow.
export function notifyWhatsAppSafely(event: WhatsAppEvent, toPhone: string | null | undefined, parameters: string[] = []): void {
  void notifyWhatsAppTemplate(event, toPhone, parameters).catch((error) => {
    console.error(`[PG notifications] ${event} failed:`, error);
  });
}
