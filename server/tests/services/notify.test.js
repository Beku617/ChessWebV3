import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { notifyUser, notifyUsers, serializeNotification } from "../../services/notify.js";
import { Notification } from "../../models/index.js";

function ioHarness() {
  const shots = [];
  const io = { to: (room) => ({ emit: (event, payload) => shots.push({ room, event, payload }) }) };
  return { shots, app: { get: (key) => (key === "io" ? io : undefined) } };
}

test("notifyUser writes once and emits realtime", async () => {
  const { app, shots } = ioHarness();
  mock.method(Notification, "create", async (doc) => ({ _id: "n1", ...doc }));

  const doc = await notifyUser(app, { userId: "u1", title: "  Hi  ", message: "Hello" });

  assert.equal(doc.title, "Hi");
  assert.equal(doc.message, "Hello");
  assert.equal(shots.length, 1);
  assert.equal(shots[0].room, "user:u1");
  mock.restoreAll();
});

test("notifyUsers dedups ids and serialization keeps strings", async () => {
  const { app, shots } = ioHarness();
  mock.method(Notification, "insertMany", async (docs) => docs.map((d, i) => ({ _id: i, ...d })));

  const docs = await notifyUsers(app, ["u1", "u2", "u1"], { title: "T", message: "M" });
  assert.equal(docs.length, 2);
  assert.deepEqual(shots.map((s) => s.room), ["user:u1", "user:u2"]);

  const payload = serializeNotification({
    _id: 5,
    userId: 7,
    type: "info",
    title: "t",
    message: "m",
    link: "",
    payload: null,
    readAt: null,
    createdAt: new Date(0),
  });

  assert.equal(payload.userId, "7");
  mock.restoreAll();
});
