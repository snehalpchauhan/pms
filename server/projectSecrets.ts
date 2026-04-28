import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const CURRENT_KEY_VERSION = 1;

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function readMasterKey(): Buffer {
  const raw = (process.env.PROJECT_SECRETS_MASTER_KEY ?? "").trim();
  if (!raw) {
    throw new Error("PROJECT_SECRETS_MASTER_KEY is not configured");
  }
  // Accept either raw text or base64; both normalize to 32 bytes using SHA-256.
  const asBuf = /^[A-Za-z0-9+/=]+$/.test(raw) ? Buffer.from(raw, "base64") : Buffer.from(raw, "utf8");
  return crypto.createHash("sha256").update(asBuf).digest();
}

export function encryptProjectSecret(plaintext: string): EncryptedSecret {
  const key = readMasterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptProjectSecret(payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}): string {
  if (payload.keyVersion !== CURRENT_KEY_VERSION) {
    throw new Error(`Unsupported secret key version: ${payload.keyVersion}`);
  }
  const key = readMasterKey();
  const decipher = crypto.createDecipheriv(
    ALGO,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return out.toString("utf8");
}

