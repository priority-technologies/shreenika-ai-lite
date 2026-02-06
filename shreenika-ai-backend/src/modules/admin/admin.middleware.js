/**
 * Super Admin Middleware
 * Checks if the authenticated user has superadmin role
 */
export const requireSuperAdmin = (req, res, next) => {
  // requireAuth middleware should have already set req.user
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Check if user has superadmin or admin role
  if (req.user.role !== "superadmin" && req.user.role !== "admin") {
    return res.status(403).json({
      error: "Access denied",
      message: "Super Admin privileges required"
    });
  }

  next();
};

/**
 * Check if current user is super admin (for frontend)
 */
export const isSuperAdmin = (user) => {
  return user && (user.role === "superadmin" || user.role === "admin");
};
