export const PLAN_LIMITS = {
  Starter: { agents: 1, docs: 0 },
  Pro: { agents: 5, docs: 25 },
  Enterprise: { agents: Infinity, docs: Infinity }
};

export const checkPlanLimit = (action: 'agent' | 'doc') => {
  return (req, res, next) => {
    const { plan } = req.user;
    const limits = PLAN_LIMITS[plan];

    if (action === 'doc' && limits.docs === 0) {
      return res.status(403).json({ message: 'Upgrade required' });
    }

    next();
  };
};
