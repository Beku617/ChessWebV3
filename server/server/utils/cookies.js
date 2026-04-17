const IS_PRODUCTION = process.env.NODE_ENV === "production";

const AUTH_MAX_AGE_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_MAX_AGE_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_MAX_AGE_1_DAY_MS = 24 * 60 * 60 * 1000;

function resolveAuthMaxAge(rememberMe) {
  const desired = rememberMe ? AUTH_MAX_AGE_30_DAYS_MS : AUTH_MAX_AGE_7_DAYS_MS;
  return Math.min(desired, AUTH_MAX_AGE_30_DAYS_MS);
}

function buildAuthCookieOptions(overrides = {}) {
  const options = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
    signed: true,
    ...overrides,
  };

  if (typeof options.maxAge === "number" && Number.isFinite(options.maxAge)) {
    options.maxAge = Math.min(
      Math.max(0, options.maxAge),
      AUTH_MAX_AGE_30_DAYS_MS,
    );
  }

  return options;
}

function buildAdminCookieOptions(overrides = {}) {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: IS_PRODUCTION ? "none" : "lax",
    path: "/",
    signed: true,
    ...overrides,
  };
}

function clearAuthCookie(res) {
  res.cookie(
    "authToken",
    "",
    buildAuthCookieOptions({
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

function clearAdminCookie(res) {
  res.cookie(
    "adminToken",
    "",
    buildAdminCookieOptions({
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

export {
  ADMIN_MAX_AGE_1_DAY_MS,
  AUTH_MAX_AGE_7_DAYS_MS,
  AUTH_MAX_AGE_30_DAYS_MS,
  buildAdminCookieOptions,
  buildAuthCookieOptions,
  clearAdminCookie,
  clearAuthCookie,
  resolveAuthMaxAge,
};
