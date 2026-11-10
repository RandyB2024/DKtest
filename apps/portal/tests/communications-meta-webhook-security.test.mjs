import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyMetaWebhookSignature, verifyMetaWebhookChallenge } from "../lib/communications/meta-webhook-security.ts";

test("Meta signature accepts only the exact signed raw body", async () => {
  const secret = "local-test-secret";
  const body = new TextEncoder().encode('{"object":"whatsapp_business_account"}');
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(await verifyMetaWebhookSignature(body, signature, secret), true);
  assert.equal(await verifyMetaWebhookSignature(new TextEncoder().encode("{}"), signature, secret), false);
  assert.equal(await verifyMetaWebhookSignature(body, signature, "wrong-secret"), false);
  assert.equal(await verifyMetaWebhookSignature(body, null, secret), false);
  assert.equal(await verifyMetaWebhookSignature(body, "sha256=bad", secret), false);
});

test("Meta verification challenge requires configured token and numeric challenge", () => {
  assert.equal(verifyMetaWebhookChallenge("subscribe", "token", "token", "123456"), "123456");
  assert.equal(verifyMetaWebhookChallenge("subscribe", "wrong", "token", "123456"), null);
  assert.equal(verifyMetaWebhookChallenge("unsubscribe", "token", "token", "123456"), null);
  assert.equal(verifyMetaWebhookChallenge("subscribe", "token", "token", "secret"), null);
});
