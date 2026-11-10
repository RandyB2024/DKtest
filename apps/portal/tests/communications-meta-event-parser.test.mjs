import test from "node:test";
import assert from "node:assert/strict";
import { parseWhatsAppInboundEvents } from "../lib/communications/meta-event-parser.ts";

test("extracts inbound text with provider identity and stable dedup key", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "phone-randy" },
      messages: [{ id: "wamid.123", from: "31612345678", type: "text",
        timestamp: "1794355200", text: { body: "Hallo BESTEMD" } }],
    } }] }],
  };
  assert.deepEqual(parseWhatsAppInboundEvents(payload), [{
    eventKey: "phone-randy:wamid.123",
    providerPhoneNumberId: "phone-randy",
    messageId: "wamid.123",
    senderPhone: "31612345678",
    messageType: "text",
    body: "Hallo BESTEMD",
    providerTimestamp: "2026-11-11T00:00:00.000Z",
  }]);
});

test("ignores delivery statuses and malformed messages", () => {
  assert.deepEqual(parseWhatsAppInboundEvents(null), []);
  assert.deepEqual(parseWhatsAppInboundEvents({ object: "not_whatsapp", entry: [] }), []);
  assert.deepEqual(parseWhatsAppInboundEvents({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "phone" },
      statuses: [{ id: "wamid.123", status: "delivered" }],
      messages: [{ from: "31612345678", type: "text" }],
    } }] }],
  }), []);
});
