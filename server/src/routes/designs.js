import { Router } from 'express';
import mongoose from 'mongoose';
import { Design } from '../models.js';
import { buildDesign } from '../engine/design.js';
import { buildPlan } from '../engine/plan.js';
import { renderAll } from '../engine/config.js';
import { buildBom, streamReport } from '../engine/report.js';
import { allocatePrivateBlock, allocateWan, allocatePublic, reserveCustomerBlock, releaseDesign } from '../engine/ipam.js';

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const notFound = () => Object.assign(new Error('Design not found'), { status: 404 });

r.post(
  '/',
  wrap(async (req, res) => {
    const input = req.body;
    const design = buildDesign(input);
    const _id = new mongoose.Types.ObjectId();
    const customer = input.customerName.trim();
    try {
      const lanBlock =
        input.ipMethod === 'customer'
          ? await reserveCustomerBlock(input.customerNetwork || '', customer, _id)
          : await allocatePrivateBlock(customer, _id);
      const wanLinks = [];
      for (let i = 0; i < design.router.count; i++) wanLinks.push(await allocateWan(customer, _id));
      const publicBlock = input.publicIps?.needed ? await allocatePublic(input.publicIps.count || 1, customer, _id) : null;

      const plan = buildPlan(design, input, { lanBlock, wanLinks, publicBlock });
      const doc = await Design.create({
        _id,
        customerName: customer,
        input,
        design,
        ipPlan: plan.ipPlan,
        topology: plan.topology,
        configs: renderAll(plan.devices),
        bom: buildBom(design),
      });
      res.status(201).json(doc);
    } catch (e) {
      await releaseDesign(_id);
      throw e;
    }
  })
);

r.get(
  '/',
  wrap(async (req, res) => {
    res.json(await Design.find({}, 'customerName createdAt design.designUsers ipPlan.lanBlock').sort({ createdAt: -1 }).lean());
  })
);

r.get(
  '/:id',
  wrap(async (req, res) => {
    const doc = await Design.findById(req.params.id).lean();
    if (!doc) throw notFound();
    res.json(doc);
  })
);

r.get(
  '/:id/pdf',
  wrap(async (req, res) => {
    const doc = await Design.findById(req.params.id).lean();
    if (!doc) throw notFound();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.customerName.replace(/\W+/g, '_')}_design.pdf"`);
    streamReport(doc, res);
  })
);

r.delete(
  '/:id',
  wrap(async (req, res) => {
    await releaseDesign(req.params.id);
    await Design.findByIdAndDelete(req.params.id);
    res.status(204).end();
  })
);

export default r;
