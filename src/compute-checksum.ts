/** The default function to compute a checksum with. Needs an `algorithm`,
 * which is specified in the options (ignore if a custom checksum function
 * is given) */
export async function computeChecksum(
  content: ArrayBuffer,
  algorithm: string,
): Promise<string> {
  const buffer = await crypto.subtle.digest(algorithm, content);
  const uint8Array = new Uint8Array(buffer);
  const rawChecksum = String.fromCharCode(...uint8Array);
  const checksum = btoa(rawChecksum);
  return checksum;
}
