export default function requireVerifiedEmail(req, res, next) {
  if (!req.user?.emailVerified) {
    return res.status(403).json({ error: "Email not verified" });
  }
  next();
}
