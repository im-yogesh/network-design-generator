import { IpPool } from '../models.js';
import { parseCidr, intToIp, overlaps, prefixForHosts } from './ip.js';

const conflict = (msg) => Object.assign(new Error(msg), { status: 409 });

// Unique index on `network` makes concurrent allocations safe: loser retries.
async function allocateSequential({ type, parent, prefix, startIndex = 0, customer, designId }) {
  const p = parseCidr(parent);
  const size = 2 ** (32 - prefix);
  const total = 2 ** (prefix - p.prefix);
  for (let attempt = 0; attempt < 5; attempt++) {
    const used = new Set((await IpPool.find({ type }, 'network').lean()).map((d) => d.network));
    let network = null;
    for (let i = startIndex; i < total; i++) {
      const cidr = `${intToIp(p.base + i * size)}/${prefix}`;
      if (!used.has(cidr)) {
        network = cidr;
        break;
      }
    }
    if (!network) throw conflict(`${type} pool ${parent} exhausted`);
    try {
      await IpPool.create({ network, prefix, type, status: 'Allocated', assignedTo: customer, designId });
      return network;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  throw conflict(`Could not allocate from ${type} pool, try again`);
}

export const allocatePrivateBlock = (customer, designId) =>
  allocateSequential({ type: 'private', parent: '10.0.0.0/8', prefix: 16, startIndex: 10, customer, designId });

export const allocateWan = (customer, designId) =>
  allocateSequential({ type: 'wan', parent: '172.16.0.0/16', prefix: 30, customer, designId });

export async function reserveCustomerBlock(cidr, customer, designId) {
  const { base, prefix } = parseCidr(cidr);
  const network = `${intToIp(base)}/${prefix}`;
  const existing = await IpPool.find({ type: 'private' }).lean();
  const hit = existing.find((e) => overlaps(e.network, network));
  if (hit) throw conflict(`IP Conflict Detected: ${network} overlaps ${hit.network} (allocated to ${hit.assignedTo}). Choose another network.`);
  try {
    await IpPool.create({ network, prefix, type: 'private', status: 'Allocated', assignedTo: customer, designId });
  } catch (e) {
    if (e.code === 11000) throw conflict(`IP Conflict Detected: ${network} already allocated`);
    throw e;
  }
  return network;
}

// Public IPs come only from ISP inventory (seeded pool), never generated.
export async function allocatePublic(count, customer, designId) {
  const prefix = Math.min(29, prefixForHosts(Number(count) + 1));
  const doc = await IpPool.findOneAndUpdate(
    { type: 'public', status: 'Available', prefix: { $lte: prefix } },
    { $set: { status: 'Allocated', assignedTo: customer, designId } },
    { sort: { prefix: -1, network: 1 }, new: true }
  );
  if (!doc) throw conflict(`No public IP block available for ${count} addresses. Add blocks to the public pool.`);
  return doc.network;
}

export async function releaseDesign(designId) {
  await IpPool.deleteMany({ designId, type: { $in: ['private', 'wan'] } });
  await IpPool.updateMany({ designId, type: 'public' }, { $set: { status: 'Available', assignedTo: null, designId: null } });
}
