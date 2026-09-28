import 'dotenv/config';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { IpPool } from './models.js';

// Sample ISP public inventory
const BLOCKS = [
  ...Array.from({ length: 8 }, (_, i) => `103.10.1.${i * 8}/29`),
  ...Array.from({ length: 4 }, (_, i) => `103.10.2.${i * 16}/28`),
  ...Array.from({ length: 2 }, (_, i) => `103.10.3.${i * 32}/27`),
];

export async function seedPublicPool() {
  if (await IpPool.exists({ type: 'public' })) return;
  await IpPool.insertMany(BLOCKS.map((network) => ({ network, prefix: Number(network.split('/')[1]), type: 'public' })));
  console.log(`Seeded ${BLOCKS.length} public IP blocks`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mongoose.connect(process.env.MONGO_URI);
  await seedPublicPool();
  await mongoose.disconnect();
}
