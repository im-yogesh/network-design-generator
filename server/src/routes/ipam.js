import { Router } from 'express';
import { IpPool } from '../models.js';
import { parseCidr, intToIp } from '../engine/ip.js';

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

r.get(
  '/',
  wrap(async (req, res) => {
    res.json(await IpPool.find().sort({ type: 1, network: 1 }).lean());
  })
);

// Add ISP public inventory, e.g. { "network": "103.10.5.0/29" }
r.post(
  '/public',
  wrap(async (req, res) => {
    const { base, prefix } = parseCidr(req.body.network || '');
    const network = `${intToIp(base)}/${prefix}`;
    try {
      res.status(201).json(await IpPool.create({ network, prefix, type: 'public' }));
    } catch (e) {
      if (e.code === 11000) throw Object.assign(new Error(`${network} already exists`), { status: 409 });
      throw e;
    }
  })
);

export default r;
