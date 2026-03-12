// Auth Middleware for regular users
export const authMiddleware = (req, res, next) => {
  const authToken = req.cookies.authToken;
  if (!authToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    req.user = JSON.parse(authToken);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Optional auth for public endpoints that can personalize or enforce block rules.
export const optionalAuthMiddleware = (req, res, next) => {
  const authToken = req.cookies.authToken;
  if (!authToken) {
    req.user = null;
    return next();
  }
  try {
    req.user = JSON.parse(authToken);
  } catch {
    req.user = null;
  }
  next();
};

// Admin Auth Middleware
export const adminAuthMiddleware = (req, res, next) => {
  const adminToken = req.cookies.adminToken;
  if (!adminToken) {
    return res.status(401).json({ error: "Not authenticated as admin" });
  }
  try {
    const parsed = JSON.parse(adminToken);
    if (!parsed.isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }
    req.admin = parsed;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid admin token" });
  }
};
