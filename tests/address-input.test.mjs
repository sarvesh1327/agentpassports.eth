import assert from "node:assert/strict";
import test from "node:test";

test("address form input accepts valid addresses with surrounding whitespace", async () => {
  const { normalizeAddressInput } = await import("../apps/web/lib/addressInput.ts");
  const address = "0x1234567890abcdef1234567890abcdef12345678";

  assert.equal(normalizeAddressInput(`  ${address}\n`), address);
});

test("address form input rejects incomplete EVM addresses", async () => {
  const { normalizeAddressInput } = await import("../apps/web/lib/addressInput.ts");

  assert.equal(normalizeAddressInput("0x1234"), null);
});
