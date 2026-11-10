import test from "node:test";
import assert from "node:assert/strict";
import { decideWhatsAppRouting } from "../lib/communications/whatsapp-routing.ts";

const event = {
  eventKey: "p:1", providerPhoneNumberId: "p", messageId: "1",
  senderPhone: "31612345678", messageType: "text", body: "Hallo",
  providerTimestamp: null,
};
const candidate = { contactId: "contact-1", organizationId: "org-1", phone: "06 12345678" };
const channels = new Set(["p"]);

test("only unique, explicitly authorized associations can be assigned", () => {
  assert.deepEqual(decideWhatsAppRouting(event, channels, [candidate], new Set(["org-1"])), {
    status: "assign", organizationId: "org-1", contactId: "contact-1",
    phoneE164: "+31612345678", providerPhoneNumberId: "p",
  });
});

test("ambiguous cross-organization phone numbers are never auto-routed", () => {
  const other = { contactId: "contact-2", organizationId: "org-2", phone: "+31612345678" };
  assert.deepEqual(decideWhatsAppRouting(event, channels, [candidate, other], new Set(["org-1"])), {
    status: "manual_review", reason: "ambiguous_contact",
  });
});

test("unregistered channel, unauthorized org, and unknown contact are held", () => {
  assert.equal(decideWhatsAppRouting(event, new Set(), [candidate], new Set(["org-1"])).reason, "unregistered_channel");
  assert.equal(decideWhatsAppRouting(event, channels, [candidate], new Set()).reason, "unauthorized_organization");
  assert.equal(decideWhatsAppRouting(event, channels, [], new Set(["org-1"])).reason, "unknown_contact");
});
