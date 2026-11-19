import jwt from 'jsonwebtoken';
import { User } from '../models.js';

const fail = (status, msg) => Object.assign(new Error(msg), { status });

export function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw fail(500, 'JWT_SECRET is not set');
  return jwt.sign({ sub: user._id.toString(), email: user.email }, secret, { expiresIn: '7d' });
}

export async function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) throw fail(401, 'Login required');
    const secret = process.env.JWT_SECRET;
    if (!secret) throw fail(500, 'JWT_SECRET is not set');
    const payload = jwt.verify(token, secret);
    const user = await User.findById(payload.sub).select('_id name email').lean();
    if (!user) throw fail(401, 'Invalid session');
    req.user = user;
    next();
  } catch (e) {
    if (e.status) return next(e);
    next(fail(401, 'Invalid or expired token'));
  }
}
