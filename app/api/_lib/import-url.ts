function publicIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

function publicIpv6(host: string): boolean {
  const halves = host.split("::");
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 2 && missing < 1)) return false;
  const words = [...left, ...(halves.length === 2 ? Array<string>(missing).fill("0") : []), ...right];
  if (words.length !== 8 || words.some(word => !/^[0-9a-f]{1,4}$/.test(word))) return false;
  const values = words.map(word => Number.parseInt(word, 16));
  // Global unicast only: excludes unspecified/loopback, mapped IPv4, ULA,
  // link/site-local, multicast and translation prefixes without DNS lookups.
  return (values[0] & 0xe000) === 0x2000 &&
    !(values[0] === 0x2001 && values[1] === 0x0db8);
}

/** URL parsing canonicalizes decimal/octal/hex IPv4 before range checks. */
export function isPublicImportUrl(target: URL): boolean {
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host.startsWith("[")) return publicIpv6(host.slice(1, -1));
  if (/^[0-9.]+$/.test(host)) return publicIpv4(host);
  // A permitted hostname can still resolve/rebind to a private address. This
  // policy does not inspect or pin fetch's DNS result, including in local mode.
  return true;
}
