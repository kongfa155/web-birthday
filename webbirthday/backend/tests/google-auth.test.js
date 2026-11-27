import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import { createApp } from "../app.js";
import { createGoogleNonceStore } from "../utils/googleNonce.js";
import { verifyGoogleCredential } from "../utils/googleAuth.js";
import { hasUniqueGoogleIndex } from "../utils/registrationIndex.js";

mongoose.set("bufferCommands", false);
const CLIENT = "test-client.apps.googleusercontent.com";
const APP_SECRET = "only-for-tests-google-app-secret";
const ORIGIN = "http://localhost:5173";
const original = { client: process.env.GOOGLE_CLIENT_ID, secret: process.env.JWT_SECRET, origins: process.env.GOOGLE_AUTH_ORIGINS };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" });
const localId = "111111111111111111111111";
let users, lookups, saves, indexes, server, base, saveFailure;
const query = (result) => ({ collation: async () => result, select: async () => result });
function googleToken(nonce, claims = {}, options = {}) {
  return jwt.sign({ sub: "123456789012345678901", email: "same@example.com", email_verified: true, nonce, ...claims }, privateKey, { algorithm: "RS256", keyid: "google-test-key", audience: CLIENT, issuer: "https://accounts.google.com", expiresIn: "1h", ...options });
}
async function api(path, { method = "POST", body = {}, cookie, origin = ORIGIN, auth } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(method !== "GET" ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(auth ? { Authorization: "Bearer " + auth } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function challenge() {
  const result = await api("/api/users/google/challenge");
  assert.equal(result.status, 200);
  return { nonce: result.body.nonce, cookie: result.headers.get("set-cookie").split(";")[0], headers: result.headers };
}
async function signIn(claims = {}, extraBody = {}) {
  const state = await challenge();
  const result = await api("/api/users/google", { cookie: state.cookie, body: { credential: googleToken(state.nonce, claims), ...extraBody } });
  return { ...result, state };
}
before(async () => {
  process.env.GOOGLE_CLIENT_ID = CLIENT; process.env.JWT_SECRET = APP_SECRET; process.env.GOOGLE_AUTH_ORIGINS = ORIGIN;
  server = createApp().listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve)); mock.restoreAll();
  for (const [key, value] of Object.entries({ GOOGLE_CLIENT_ID: original.client, JWT_SECRET: original.secret, GOOGLE_AUTH_ORIGINS: original.origins })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
beforeEach(() => {
  mock.restoreAll(); process.env.GOOGLE_CLIENT_ID = CLIENT; process.env.JWT_SECRET = APP_SECRET;
  users = [{ _id: localId, username: "same@example.com", email: "same@example.com", password: "legacy-hash", isAdmin: true, isActive: true }];
  lookups = []; saves = 0; saveFailure = null;
  indexes = [{ key: { username: 1 }, unique: true }, { key: { googleSub: 1 }, unique: true, partialFilterExpression: { googleSub: { $type: "string" } } }];
  mock.method(mongoose, "connect", () => { throw new Error("No database connections in tests"); });
  mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => ({ certs: { "google-test-key": publicPem }, format: "PEM" }));
  mock.method(User.collection, "listIndexes", () => ({ toArray: async () => indexes }));
  mock.method(User, "findOne", (filter) => { lookups.push(filter); return query(users.find((user) => Object.entries(filter).every(([key, value]) => String(user[key]) === String(value))) || null); });
  mock.method(User, "findById", (id) => query(users.find((user) => String(user._id) === String(id)) || null));
  mock.method(User.prototype, "save", async function () {
    await Promise.resolve();
    if (saveFailure) { const error = saveFailure; saveFailure = null; throw error; }
    if (users.some((user) => user.googleSub && user.googleSub === this.googleSub)) throw Object.assign(new Error("duplicate subject"), { code: 11000, keyPattern: { googleSub: 1 } });
    saves += 1; users.push(this); return this;
  });
});

test("model accepts Google-only accounts, requires a password for local accounts, and declares the approved partial index", () => {
  assert.equal(new User({ username: "google_test", googleSub: "sub" }).validateSync(), undefined);
  assert.ok(new User({ username: "local_test" }).validateSync()?.errors.password);
  const index = User.schema.indexes().find(([key]) => key.googleSub === 1);
  assert.ok(index[1].unique); assert.deepEqual(index[1].partialFilterExpression, { googleSub: { $type: "string" } });
});
test("official Google verifier validates a signed token using public certificates", async () => {
  const payload = await verifyGoogleCredential(googleToken("nonce")); assert.equal(payload.sub, "123456789012345678901"); assert.equal(payload.aud, CLIENT);
});
test("official verifier rejects wrong audience, issuer, expired tokens, missing subject and tampered signatures", async () => {
  const wrong = [googleToken("n", {}, { audience: "another-client" }), googleToken("n", {}, { issuer: "https://attacker.invalid" }), googleToken("n", {}, { expiresIn: -1000 }), googleToken("n", { sub: "" }), googleToken("n") + "x"];
  for (const credential of wrong) await assert.rejects(verifyGoogleCredential(credential));
});
test("Google challenge is browser-cookie bound, HttpOnly and no-store; untrusted origins are rejected", async () => {
  const state = await challenge(); assert.equal(state.nonce.length, 43);
  assert.ok(state.headers.get("set-cookie").includes("HttpOnly")); assert.ok(state.headers.get("set-cookie").includes("SameSite=Lax")); assert.equal(state.headers.get("cache-control"), "no-store");
  assert.equal((await api("/api/users/google/challenge", { origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/users/google/challenge", { origin: null })).status, 403);
});
test("first Google login creates a passwordless USER independently of a legacy account with matching email/username", async () => {
  const result = await signIn({}, { role: "ADMIN", isAdmin: true, googleSub: "forged", email: "forged@example.com", password: "ignored" });
  assert.equal(result.status, 201); assert.equal(saves, 1); assert.equal(users.length, 2);
  const created = users[1]; assert.equal(created.googleSub, "123456789012345678901"); assert.equal(created.password, undefined); assert.equal(created.isAdmin, false); assert.equal(created.email, "same@example.com");
  assert.notEqual(String(created._id), localId); assert.notEqual(created.username, users[0].username); assert.equal(users[0].password, "legacy-hash"); assert.equal(users[0].isAdmin, true);
  assert.ok(lookups.every((filter) => Object.keys(filter).length === 1 && "googleSub" in filter));
  assert.equal(jwt.verify(result.body.token, APP_SECRET).id, String(created._id));
  assert.ok(!("password" in result.body.user)); assert.ok(!("googleSub" in result.body.user));
  const me = await api("/api/users/me", { method: "GET", auth: result.body.token }); assert.equal(me.status, 200); assert.equal(me.body.user._id, String(created._id));
});
test("returning Google login uses subject even when the email changes, never creates a duplicate", async () => {
  users.push({ _id: "222222222222222222222222", username: "google_existing", googleSub: "123456789012345678901", email: "old@example.com", isAdmin: false, isActive: true });
  const result = await signIn({ email: "new@example.com" }); assert.equal(result.status, 200); assert.equal(saves, 0); assert.equal(result.body.user._id, "222222222222222222222222");
});
test("blocked Google account stays blocked and is not recreated", async () => {
  users.push({ _id: "222222222222222222222222", username: "google_blocked", googleSub: "123456789012345678901", isAdmin: false, isActive: false });
  const result = await signIn(); assert.equal(result.status, 403); assert.equal(result.body.code, "ACCOUNT_DISABLED"); assert.equal(saves, 0);
});
test("missing cookie, incorrect nonce and token replay are rejected before creating accounts", async () => {
  const state = await challenge();
  assert.equal((await api("/api/users/google", { body: { credential: googleToken(state.nonce) } })).status, 401);
  assert.equal((await api("/api/users/google", { cookie: state.cookie, body: { credential: googleToken("wrong") } })).status, 401);
  assert.equal(saves, 0);
  const credential = googleToken(state.nonce);
  assert.equal((await api("/api/users/google", { cookie: state.cookie, body: { credential } })).status, 201);
  assert.equal((await api("/api/users/google", { cookie: state.cookie, body: { credential } })).status, 401); assert.equal(saves, 1);
});
test("nonce store expires challenges and safely handles multi-byte nonce mismatches", () => {
  let now = 0; const store = createGoogleNonceStore({ now: () => now }); const nonce = store.issue();
  assert.equal(store.consume(nonce, "é".repeat(43)), false); now = 300001; assert.equal(store.consume(nonce, nonce), false);
});
test("unverified emails are not persisted, but verified Google subject can sign in", async () => {
  const result = await signIn({ email_verified: false }); assert.equal(result.status, 201); assert.equal(users[1].email, undefined);
});
test("Google sign-in refuses to create accounts without required index or client configuration", async () => {
  indexes = [{ key: { username: 1 }, unique: true }];
  const result = await signIn(); assert.equal(result.status, 503); assert.equal(saves, 0); assert.equal(await hasUniqueGoogleIndex(), false);
  delete process.env.GOOGLE_CLIENT_ID; assert.equal((await api("/api/users/google/challenge")).status, 503);
});
test("simultaneous first sign-ins converge on one Google account", async () => {
  const a = await challenge(), b = await challenge();
  const results = await Promise.all([api("/api/users/google", { cookie: a.cookie, body: { credential: googleToken(a.nonce) } }), api("/api/users/google", { cookie: b.cookie, body: { credential: googleToken(b.nonce) } })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]); assert.equal(saves, 1); assert.equal(results[0].body.user._id, results[1].body.user._id);
});
test("a generated username collision is retried rather than merging into that account", async () => {
  saveFailure = Object.assign(new Error("username collision"), { code: 11000, keyPattern: { username: 1 } });
  const result = await signIn(); assert.equal(result.status, 201); assert.equal(saves, 1); assert.equal(users[0]._id, localId);
});
test("Google-only accounts fail password login gracefully rather than producing a server error", async () => {
  users.push({ _id: "222222222222222222222222", username: "google_existing", googleSub: "google-sub", isAdmin: false, isActive: true });
  const result = await api("/api/users/login", { body: { username: "google_existing", password: "anything" } }); assert.equal(result.status, 401);
});
test("Google endpoints validate input and enforce their login rate limit", async () => {
  assert.equal((await api("/api/users/google", { body: {} })).status, 400);
  let result;
  for (let attempt = 0; attempt < 25; attempt += 1) result = await api("/api/users/google", { body: {} });
  assert.equal(result.status, 429); assert.ok(Number(result.headers.get("retry-after")) > 0);
});
test("default loopback origins accept localhost and 127.0.0.1 on 5173 without allowing other ports or hosts", async () => {
  const saved = process.env.GOOGLE_AUTH_ORIGINS;
  try {
    delete process.env.GOOGLE_AUTH_ORIGINS;
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
      const result = await api("/api/users/google/challenge", { origin });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("access-control-allow-origin"), origin);
      assert.equal(result.headers.get("access-control-allow-credentials"), "true");
    }
    for (const origin of ["http://localhost:5174", "http://127.0.0.1:5174", "http://127.0.0.2:5173", "http://127.0.0.1.attacker.invalid:5173"]) {
      assert.equal((await api("/api/users/google/challenge", { origin })).status, 403);
    }
    process.env.GOOGLE_AUTH_ORIGINS = ORIGIN;
    assert.equal((await api("/api/users/google/challenge", { origin: "http://127.0.0.1:5173" })).status, 403);
    assert.equal(saves, 0);
  } finally {
    if (saved === undefined) delete process.env.GOOGLE_AUTH_ORIGINS;
    else process.env.GOOGLE_AUTH_ORIGINS = saved;
  }
});
