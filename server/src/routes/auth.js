import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (status, msg) => Object.assign(new Error(msg), { status });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

r.post(
  '/signup',
  wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name) throw bad(400, 'Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad(400, 'Valid email is required');
    if (password.length < 6) throw bad(400, 'Password must be at least 6 characters');

    const exists = await User.findOne({ email }).lean();
    if (exists) throw bad(409, 'Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  })
);

r.post(
  '/login',
  wrap(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw bad(401, 'Invalid email or password');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

r.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

export default r;
