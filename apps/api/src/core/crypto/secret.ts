import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SEPARATOR = ":";
const IV_LENGTH = 12;
export const deriveKey = (secret: string) =>
  createHash("sha256").update(secret, "utf8").digest();

export const encryptSecret = (plaintext: string, secret: string) => {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(SEPARATOR);
};

export const decryptSecret = (payload: string, secret: string) => {
  const key = deriveKey(secret);
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(SEPARATOR);
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("invalid_encrypted_payload");
  }
  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const encrypted = Buffer.from(encryptedRaw, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};
