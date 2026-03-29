'use strict';
const jwt  = require('jsonwebtoken');
const User = require('./user.model.js');

/* =========================
   REQUIRE AUTH (JWT)
========================= */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/* =========================
   REQUIRE VERIFIED EMAIL
========================= */
const requireVerifiedEmail = (req, res, next) => {
  if (!req.user || req.user.emailVerified !== true) {
    return res.status(403).json({ error: 'Email verification required' });
  }
  next();
};

/* =========================
   REQUIRE SUPER ADMIN
========================= */
const requireSuperAdmin = async (req, res, next) => {
  // Must run after requireAuth (req.user already populated)
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  next();
};

/* =========================
   REQUIRE ROLE (generic)
========================= */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Access requires role: ${roles.join(' or ')}` });
  }
  next();
};

module.exports = { requireAuth, requireVerifiedEmail, requireSuperAdmin, requireRole };
