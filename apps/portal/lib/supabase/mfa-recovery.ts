import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_CODE_COUNT = 8;

const CODE_BYTES = 16;

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();

  while (codes.size < RECOVERY_CODE_COUNT) {
    const hex = randomBytes(CODE_BYTES)
      .toString("hex")
      .toUpperCase();

    const formatted = hex.match(/.{1,8}/g)!.join("-");

    codes.add(formatted);
  }

  return [...codes];
}

export function normalizeRecoveryCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function hashRecoveryCode(
  userId: string,
  code: string,
): string {
  const normalized = normalizeRecoveryCode(code);

  if (!/^[A-F0-9]{32}$/.test(normalized)) {
    throw new Error("Ongeldige herstelcode.");
  }

  return createHash("sha256")
    .update(`bestemd-mfa-recovery-v1:${userId}:${normalized}`)
    .digest("hex");
}

export function verifyRecoveryCodeHash(
  userId: string,
  code: string,
  expectedHash: string,
): boolean {
  try {
    const actual = Buffer.from(
      hashRecoveryCode(userId, code),
      "hex",
    );

    if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
      return false;
    }

    const expected = Buffer.from(expectedHash, "hex");

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}