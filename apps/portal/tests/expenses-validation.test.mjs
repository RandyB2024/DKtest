import test from "node:test";
import assert from "node:assert/strict";
import { detectExpenseEvidenceMime, normalizedExpenseMime, safeExpenseFilename, MAX_EXPENSE_FILE_BYTES } from "../lib/expense-file-validation.ts";
import { expenseCategories } from "../lib/expense-categories.ts";

test("declaratie: alle 14 kostensoorten zijn uniek", () => {
  assert.equal(expenseCategories.length, 14);
  assert.equal(new Set(expenseCategories.map(([key])=>key)).size, 14);
});
test("bestandscontrole: PDF, JPG, PNG en HEIC herkennen", () => {
  assert.equal(detectExpenseEvidenceMime(Uint8Array.from([37,80,68,70,45,49,46,54,10,0,0,0])), "application/pdf");
  assert.equal(detectExpenseEvidenceMime(Uint8Array.from([255,216,255,224,0,0,0,0,0,0,0,0])), "image/jpeg");
  assert.equal(detectExpenseEvidenceMime(Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])), "image/png");
  assert.equal(detectExpenseEvidenceMime(Uint8Array.from([0,0,0,24,102,116,121,112,104,101,105,99])), "image/heic");
});
test("bestandscontrole: onveilig of onbekend bestand niet herkend", () => {
  assert.equal(detectExpenseEvidenceMime(Uint8Array.from([60,115,99,114,105,112,116,62,0,0,0,0])), null);
  assert.equal(detectExpenseEvidenceMime(Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0])), null);
  assert.equal(MAX_EXPENSE_FILE_BYTES, 15728640);
});
test("bewijsmateriaal: HEIF van smartphone naar HEIC MIME en veilige naam", () => {
  assert.equal(normalizedExpenseMime("image/heif"), "image/heic");
  assert.equal(safeExpenseFilename("../../bon <script>.heic", "image/heic"), "bon-script-.heic");
  assert.equal(safeExpenseFilename("bewijs.pdf", "application/pdf"), "bewijs.pdf");
});
