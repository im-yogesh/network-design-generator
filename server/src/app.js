import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import designRoutes from './routes/designs.js';
import ipamRoutes from './routes/ipam.js';
import { seedPublicPool } from './seed.js';

// Cached across serverless invocations; reset on failure so the next request retries.
let ready;
const connect = () =>
  (ready ||= mongoose
    .connect(process.env.MONGO_URI)
    .then(seedPublicPool)
    .catch((e) => {
      ready = null;
      throw e;
    }));

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => connect().then(() => next(), next));

app.use('/api/designs', designRoutes);
app.use('/api/ipam', ipamRoutes);

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

export default app;
