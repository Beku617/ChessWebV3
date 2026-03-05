import { Notification } from "../models/index.js";

function normalizeId(value) {
  return value ? String(value) : "";
}

function toPayload(notificationDoc) {
  return {
    _id: String(notificationDoc._id),
    userId: normalizeId(notificationDoc.userId),
    type: notificationDoc.type,
    title: notificationDoc.title,
    message: notificationDoc.message,
    link: notificationDoc.link || "",
    payload: notificationDoc.payload ?? null,
    readAt: notificationDoc.readAt ?? null,
    createdAt: notificationDoc.createdAt ?? null,
  };
}

function emitRealtime(app, notificationDoc) {
  const io = app?.get?.("io");
  if (!io) return;
  const userId = normalizeId(notificationDoc.userId);
  if (!userId) return;
  io.to(`user:${userId}`).emit("notification", toPayload(notificationDoc));
}

export async function notifyUser(app, input) {
  const userId = normalizeId(input?.userId);
  if (!userId) return null;

  const notification = await Notification.create({
    userId,
    type: String(input?.type || "system"),
    title: String(input?.title || "Notification").trim().slice(0, 120),
    message: String(input?.message || "").trim().slice(0, 600),
    link: String(input?.link || "").trim().slice(0, 300),
    payload: input?.payload ?? null,
  });

  emitRealtime(app, notification);
  return notification;
}

export async function notifyUsers(app, userIds, input) {
  const uniqueIds = [...new Set((userIds || []).map((id) => normalizeId(id)).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const docs = await Notification.insertMany(
    uniqueIds.map((userId) => ({
      userId,
      type: String(input?.type || "system"),
      title: String(input?.title || "Notification").trim().slice(0, 120),
      message: String(input?.message || "").trim().slice(0, 600),
      link: String(input?.link || "").trim().slice(0, 300),
      payload: input?.payload ?? null,
    })),
  );

  docs.forEach((doc) => emitRealtime(app, doc));
  return docs;
}

export function serializeNotification(notificationDoc) {
  return toPayload(notificationDoc);
}
