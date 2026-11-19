import mongoose from 'mongoose';
import { DEPT_KINDS, DEPLOYMENT_TYPES, HA_MODES } from './engine/design.js';

const poolSchema = new mongoose.Schema({
  network: { type: String, required: true, unique: true },
  prefix: { type: Number, required: true },
  type: { type: String, enum: ['private', 'public', 'wan'], required: true },
  status: { type: String, enum: ['Available', 'Allocated', 'Reserved'], default: 'Available' },
  assignedTo: { type: String, default: null },
  designId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
});

export const IpPool = mongoose.model('IpPool', poolSchema);

// Only fields present in the requirement form; anything else sent by a client is dropped (strict schema).
const inputSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true, trim: true },
    customerId: String,
    industry: String,
    sites: { count: Number, drSite: Boolean },
    users: { current: Number, growthPct: Number },
    deploymentType: { type: String, enum: DEPLOYMENT_TYPES },
    connectionType: String,
    bandwidthMbps: Number,
    haMode: { type: String, enum: Object.keys(HA_MODES) },
    departments: [
      new mongoose.Schema({ name: String, type: { type: String, enum: Object.keys(DEPT_KINDS) }, vlanId: Number }, { _id: false }),
    ],
    servers: { dhcp: Boolean, dns: Boolean },
    ipMethod: { type: String, enum: ['auto', 'customer'] },
    customerNetwork: String,
  },
  { _id: false }
);

export const Design = mongoose.model(
  'Design',
  new mongoose.Schema(
    {
      customerName: { type: String, required: true },
      input: inputSchema,
      design: Object,
      ipPlan: Object,
      topology: Object,
      configs: Object,
      bom: Object,
    },
    { timestamps: true }
  )
);
