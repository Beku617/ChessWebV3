import { test } from "node:test"; //Тест бичихэд зориулсан Node.js-ийн стандарт сан.
import assert from "node:assert/strict"; //Тестийн үр дүнг шалгахын тулд ашигладаг Node.js-ийн стандарт сан.
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../../middleware/auth.js"; //Тестлэх функц
// Регрессийн хамгаалалт: күүки дээр суурилсан баталгаажуулалтын урсгал рефакторууд дээр тасрахгүй байхыг баталгаажуулна уу.
function runMiddleware(fn, { cookies = {}, next = () => {} } = {}) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const req = { cookies };
  fn(req, res, next);
  return { req, res };
}
test("regression: authMiddleware attaches user when authToken is valid JSON", () => {
  const user = { id: "u1" };
  let called = false;
  const { req, res } = runMiddleware(authMiddleware, {
    cookies: { authToken: JSON.stringify(user) },
    next: () => {
      called = true;
    },
  });
  assert.equal(called, true);
  assert.deepEqual(req.user, user);
  assert.equal(res.statusCode, 200);
});
test("regression: authMiddleware returns 401 when token missing", () => {
  const { res } = runMiddleware(authMiddleware);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Not authenticated" });
});
test("regression: optionalAuthMiddleware gracefully skips when no token", () => {
  let called = false;
  const { req, res } = runMiddleware(optionalAuthMiddleware, {
    next: () => {
      called = true;
    },
  });
  assert.equal(called, true);
  assert.equal(req.user, null);
  assert.equal(res.statusCode, 200);
});
