import mongoose from 'mongoose';

const poolSchema = new mongoose.Schema({
  network: { type: String, required: true, unique: true },
  prefix: { type: Number, required: true },
  type: { type: String, enum: ['private', 'public', 'wan'], required: true },
  status: { type: String, enum: ['Available', 'Allocated', 'Reserved'], default: 'Available' },
  assignedTo: { type: String, default: null },
  designId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
});

export const IpPool = mongoose.model('IpPool', poolSchema);

export const Design = mongoose.model(
  'Design',
  new mongoose.Schema(
    {
      customerName: { type: String, required: true },
      input: Object,
      design: Object,
      ipPlan: Object,
      topology: Object,
      configs: Object,
      bom: Object,
    },
    { timestamps: true }
  )
);
