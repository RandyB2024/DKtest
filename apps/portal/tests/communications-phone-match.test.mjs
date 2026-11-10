import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDutchMobile, matchAuthorizedContact } from "../lib/communications/phone-match.ts";

test("Dutch mobile formats normalize consistently", () => {
  assert.equal(normalizeDutchMobile("06 1234 5678"), "+31612345678");
  assert.equal(normalizeDutchMobile("0031 6 12345678"), "+31612345678");
  assert.equal(normalizeDutchMobile("+31 (6) 1234-5678"), "+31612345678");
  assert.equal(normalizeDutchMobile("020 1234567"), null);
  assert.equal(normalizeDutchMobile("abc"), null);
});

test("matching does not assign unknown or ambiguous contacts", () => {
  const candidates = [
    { contactId: "c1", organizationId: "org-a", phone: "0612345678" },
    { contactId: "c2", organizationId: "org-b", phone: "+31612345678" },
  ];
  assert.equal(matchAuthorizedContact("+31612345678", candidates).status, "ambiguous");
  assert.equal(matchAuthorizedContact("+31699999999", candidates).status, "unknown");
  assert.equal(matchAuthorizedContact("+31612345678", candidates.slice(0, 1)).status, "unique");
  assert.equal(matchAuthorizedContact("invalid", candidates).status, "invalid");
});
