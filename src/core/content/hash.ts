/** SHA-256 of text (UTF-8) or raw bytes, as lowercase hex. Uses the browser/Node WebCrypto, no extra library. */
export async function sha256Hex(data: string | BufferSource): Promise<string> {
  const bytes: BufferSource = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
