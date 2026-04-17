import { body, validationResult } from "express-validator";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH"]);
const FORBIDDEN_KEY_CHARS = [".", "$"];
const SKIP_SANITIZE_KEYS = new Set(["password"]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .trim();
}

function sanitizeObject(input, currentKey = "") {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item, currentKey));
  }

  if (!isPlainObject(input)) {
    if (typeof input === "string") {
      if (SKIP_SANITIZE_KEYS.has(currentKey)) {
        return input.replace(/\u0000/g, "");
      }
      return sanitizeString(input);
    }
    return input;
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = sanitizeObject(value, key);
  }
  return output;
}

function hasForbiddenMongoKey(input) {
  if (Array.isArray(input)) {
    return input.some((item) => hasForbiddenMongoKey(item));
  }

  if (!isPlainObject(input)) {
    return false;
  }

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = String(key || "");
    if (
      FORBIDDEN_KEY_CHARS.some((forbiddenChar) =>
        normalizedKey.includes(forbiddenChar),
      )
    ) {
      return true;
    }
    if (hasForbiddenMongoKey(value)) {
      return true;
    }
  }

  return false;
}

const mutationFieldValidators = [
  body("email")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Email must be a string")
    .bail()
    .isEmail()
    .withMessage("Invalid email format")
    .bail()
    .normalizeEmail(),
  body("password")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Password must be a string")
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("fullName")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Full name must be a string")
    .bail()
    .trim()
    .isLength({ max: 80 })
    .withMessage("Full name cannot exceed 80 characters")
    .bail()
    .escape(),
];

export const requestSecurityMiddleware = async (req, res, next) => {
  if (!MUTATION_METHODS.has(req.method)) {
    return next();
  }

  if (req.body && (isPlainObject(req.body) || Array.isArray(req.body))) {
    req.body = sanitizeObject(req.body);
  }

  if (hasForbiddenMongoKey(req.body)) {
    return res.status(400).json({ error: "Invalid payload shape" });
  }

  for (const validator of mutationFieldValidators) {
    await validator.run(req);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0];
    return res.status(400).json({ error: firstError?.msg || "Invalid input" });
  }

  return next();
};

