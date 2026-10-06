// D-8/§10.2: the join secret IS the room id and the typed code — 100 bits
// from crypto.getRandomValues as 20 Crockford base32 characters plus a
// mod-32 check character from the same alphabet. No short code.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateSecret(): string {
  const bytes = new Uint8Array(13); // 104 bits ≥ 100
  crypto.getRandomValues(bytes);
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 20) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31]!;
    }
  }
  return out + ALPHABET[checksum(out)]!;
}

function checksum(body: string): number {
  let sum = 0;
  for (const ch of body) sum = (sum * 37 + ALPHABET.indexOf(ch)) % 32;
  return sum;
}

/** Group as K7QM-2XDP-4TR8-WHZN-3VBC-7 for display (§10.2). */
export function formatSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join('-') ?? secret;
}

/** Accept dashes, spaces, lowercase and the Crockford aliases
 *  (O→0, I/L→1); null when the shape or check character is wrong. */
export function normalizeSecret(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{21}$/.test(cleaned)) return null;
  const body = cleaned.slice(0, 20);
  if (ALPHABET[checksum(body)] !== cleaned[20]) return null;
  return cleaned;
}
