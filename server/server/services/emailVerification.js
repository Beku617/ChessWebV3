import { createHash, randomInt } from "crypto";
import nodemailer from "nodemailer";

const DEFAULT_CODE_TTL_MINUTES = 10;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

function parsePositiveInteger(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const CODE_TTL_MINUTES = parsePositiveInteger(
  process.env.EMAIL_VERIFICATION_CODE_TTL_MINUTES,
  DEFAULT_CODE_TTL_MINUTES,
);
const RESEND_COOLDOWN_SECONDS = parsePositiveInteger(
  process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  DEFAULT_RESEND_COOLDOWN_SECONDS,
);

const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;

function parseBooleanFlag(rawValue, fallback = false) {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function getSmtpCredentials() {
  const user = String(
    process.env.SMTP_GMAIL_USER || process.env.SMTP_USER || "",
  ).trim();
  const pass = String(
    process.env.SMTP_GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "",
  ).trim();

  return { user, pass };
}

function getFromAddress(defaultUser) {
  return String(process.env.EMAIL_FROM || defaultUser || "").trim();
}

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const { user, pass } = getSmtpCredentials();
  if (!user || !pass) {
    const error = new Error(
      "Verification email transport is not configured. Set SMTP_GMAIL_USER and SMTP_GMAIL_APP_PASSWORD.",
    );
    error.code = "EMAIL_TRANSPORT_NOT_CONFIGURED";
    throw error;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

function toSafeDisplayName(fullName) {
  const normalized = String(fullName || "").trim();
  return normalized || "Player";
}

function getCodeExpiryMinutes() {
  return Math.max(1, Math.floor(CODE_TTL_MS / 60000));
}

function buildVerificationEmailText({ fullName, code }) {
  return [
    `Hi ${toSafeDisplayName(fullName)},`,
    "",
    `Your NeonGambit verification code is: ${code}`,
    "",
    `This code expires in ${getCodeExpiryMinutes()} minutes.`,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");
}

export function createEmailVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailVerificationCode(code) {
  return createHash("sha256").update(String(code || "")).digest("hex");
}

export function getEmailVerificationCodeTtlMs() {
  return CODE_TTL_MS;
}

export function getEmailVerificationResendCooldownMs() {
  return RESEND_COOLDOWN_MS;
}

export function isEmailVerificationRequired() {
  return parseBooleanFlag(process.env.EMAIL_VERIFICATION_REQUIRED, false);
}

export function isVerificationEmailConfigured() {
  const { user, pass } = getSmtpCredentials();
  return Boolean(user && pass);
}

export async function sendEmailVerificationCode({ toEmail, fullName, code }) {
  const destination = String(toEmail || "").trim();
  if (!destination) {
    throw new Error("Missing destination email for verification message");
  }

  const { user } = getSmtpCredentials();
  const from = getFromAddress(user);
  if (!from) {
    const error = new Error("EMAIL_FROM is missing");
    error.code = "EMAIL_FROM_MISSING";
    throw error;
  }

  const mailer = getTransporter();
  await mailer.sendMail({
    from,
    to: destination,
    subject: "Your NeonGambit verification code",
    text: buildVerificationEmailText({ fullName, code }),
  });
}
