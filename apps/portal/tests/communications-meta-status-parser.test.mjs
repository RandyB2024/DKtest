import test from "node:test";
import assert from "node:assert/strict";
import { parseWhatsAppStatusEvents } from "../lib/communications/meta-status-parser.ts";

test("delivery receipts carry provider phone id and stable event key", () => {
  const payload = { object: "whatsapp_business_account", entry: [{
    changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "channel-1" },
      statuses: [{ id: "wamid.1", status: "delivered", timestamp: "1794355200", recipient_id: "31612345678" }],
    } }],
  }] };
  const result = parseWhatsAppStatusEvents(payload);
  assert.equal(result.length, 1);
  assert.equal(result[0].providerPhoneNumberId, "channel-1");
  assert.equal(result[0].messageId, "wamid.1");
  assert.equal(result[0].status, "delivered");
  assert.deepEqual(parseWhatsAppStatusEvents(payload), result);
});

test("malformed status payloads are not accepted", () => {
  assert.deepEqual(parseWhatsAppStatusEvents(null), []);
  assert.deepEqual(parseWhatsAppStatusEvents({ object: "other", entry: [] }), []);
  assert.deepEqual(parseWhatsAppStatusEvents({ object: "whatsapp_business_account", entry: [{
    changes: [{ field: "messages", value: { metadata: { phone_number_id: "p" },
      statuses: [{ status: "delivered" }, { id: "x", status: "not-valid" }] } }],
  }] }), []);
});
