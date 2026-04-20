import crypto from "node:crypto";

function toBase64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function fromBase64(value) {
  return Buffer.from(String(value), "base64");
}

export async function encryptPayloadBundle(payload, secret) {
  const keyBytes = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: toBase64(iv),
    ciphertext: toBase64(Buffer.concat([ciphertext, authTag]))
  });
}

export async function decodePayloadBundle(rawValue, secret) {
  const parsed = JSON.parse(String(rawValue || ""));
  const keyBytes = crypto.createHash("sha256").update(secret).digest();
  const payloadBuffer = fromBase64(parsed.ciphertext);
  const iv = fromBase64(parsed.iv);
  const authTag = payloadBuffer.subarray(payloadBuffer.length - 16);
  const ciphertext = payloadBuffer.subarray(0, payloadBuffer.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBytes, iv);
  decipher.setAuthTag(authTag);
  const decoded = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  return JSON.parse(decoded.toString("utf8"));
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}
