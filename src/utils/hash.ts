import * as crypto from "node:crypto";

export function calculateBufferHash(buf: Buffer): string {
  const hash = crypto.createHash("md5");
  hash.update(new Uint8Array(buf));
  return hash.digest("hex");
}
