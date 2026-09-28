export const ipToInt = (ip) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
export const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export function parseCidr(cidr) {
  const [ip, len] = cidr.split('/');
  const prefix = Number(len);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || ip.split('.').some((o) => o > 255) || !(prefix >= 8 && prefix <= 30)) {
    throw Object.assign(new Error(`Invalid network: ${cidr}`), { status: 400 });
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const base = ipToInt(ip) & mask;
  return { base: base >>> 0, prefix, mask };
}

export const maskStr = (prefix) => intToIp(prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);
export const wildcardStr = (prefix) => intToIp(~((0xffffffff << (32 - prefix)) >>> 0) >>> 0);

export function overlaps(a, b) {
  const x = parseCidr(a);
  const y = parseCidr(b);
  const p = Math.min(x.prefix, y.prefix);
  const m = (0xffffffff << (32 - p)) >>> 0;
  return ((x.base & m) >>> 0) === ((y.base & m) >>> 0);
}

export function subnetInfo(cidr) {
  const { base, prefix } = parseCidr(cidr);
  const size = 2 ** (32 - prefix);
  return {
    network: intToIp(base),
    cidr: `${intToIp(base)}/${prefix}`,
    prefix,
    mask: maskStr(prefix),
    wildcard: wildcardStr(prefix),
    firstHost: intToIp(base + 1),
    secondHost: intToIp(base + 2),
    thirdHost: intToIp(base + 3),
    lastHost: intToIp(base + size - 2),
    broadcast: intToIp(base + size - 1),
    usable: size - 2,
    at: (i) => intToIp(base + i),
  };
}

// Smallest prefix that fits `hosts` usable addresses
export const prefixForHosts = (hosts) => {
  let p = 30;
  while (p > 8 && 2 ** (32 - p) - 2 < hosts) p--;
  return p;
};

// Carve sequential subnets (largest first) out of a parent block
export function carve(parentCidr, requests) {
  const parent = parseCidr(parentCidr);
  const end = parent.base + 2 ** (32 - parent.prefix);
  let cursor = parent.base;
  const sorted = [...requests].sort((a, b) => a.prefix - b.prefix);
  const out = {};
  for (const r of sorted) {
    const size = 2 ** (32 - r.prefix);
    cursor = Math.ceil(cursor / size) * size;
    if (cursor + size > end) {
      throw Object.assign(new Error(`Block ${parentCidr} too small for requested subnets`), { status: 400 });
    }
    out[r.key] = subnetInfo(`${intToIp(cursor)}/${r.prefix}`);
    cursor += size;
  }
  return out;
}
