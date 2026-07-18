import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SECRET_KEY = process.env.SECRET_ENCRYPTION_KEY || "development-key-change-me";
const ALGORITHM = "aes-256-gcm";

function getKey() {
  return createHash("sha256").update(SECRET_KEY).digest();
}

export function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload) {
  const [ivHex, tagHex, encryptedHex] = payload.split(":");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
