import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import Card from "../models/Card.js";
import Template from "../models/Template.js";
import cloudinary from "../config/cloudinary.js";
import UserController from "../controllers/UserController.js";
import { createApp } from "../app.js";
import { createRateLimiter } from "../middlewares/rateLimit.js";
import { hasUniqueUsernameIndex } from "../utils/registrationIndex.js";
import { processFabricEditImages } from "../utils/processFabricEdit.js";
import { listQuery } from "./helpers/listQuery.js";

mongoose.set("bufferCommands", false);
const oldSecret = process.env.JWT_SECRET;
const SECRET = "test-only-secret-not-a-real-credential";
const ids = { admin: "111111111111111111111111", alice: "222222222222222222222222", bob: "333333333333333333333333", card: "444444444444444444444444", draft: "555555555555555555555555", unassigned: "666666666666666666666666", template: "777777777777777777777777" };
let users, cards, indexes, saves, url, server;
const token = (id, extra = {}, options = {}) => jwt.sign({ id, ...extra }, SECRET, { expiresIn: "1h", ...options });
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((item) => matches(doc, item));
    if (value === null) return doc[key] == null;
    if (typeof value === "boolean") return doc[key] === value;
    return String(doc[key]) === String(value);
  });
}
const query = (value) => ({ select: async () => value, collation: async () => value, populate: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
async function request(path, { method = "GET", body, auth } = {}) {
  const response = await fetch(url + path, { method, headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(auth ? { Authorization: "Bearer " + auth } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
function responseStub() {
  return { statusCode: 200, payload: null, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; }, set(key, value) { this.headers[key] = value; return this; } };
}
async function register(body) {
  const res = responseStub();
  await UserController.register({ body }, res);
  return { status: res.statusCode, body: res.payload };
}
before(async () => {
  process.env.JWT_SECRET = SECRET;
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
  if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
});
beforeEach(async () => {
  mock.restoreAll();
  process.env.JWT_SECRET = SECRET;
  const password = await bcrypt.hash("old123", 4);
  users = new Map(Object.entries(ids).filter(([key]) => ["admin", "alice", "bob"].includes(key)).map(([name, _id]) => [_id, { _id, username: name, password, isAdmin: name === "admin", isActive: true, createdAt: new Date("2026-01-01"), cards: ["SHOULD_NOT_LEAK"] }]));
  cards = [
    { _id: ids.card, cardName: "Alice private design", owner: ids.alice, isEditable: false, fabricEdit: "https://private.example/alice.json", imgURL: ["alice-preview"] },
    { _id: ids.draft, cardName: "Alice draft", owner: ids.alice, isEditable: true },
    { _id: ids.unassigned, cardName: "Legacy admin design", owner: null, isEditable: true },
  ];
  saves = 0;
  indexes = [{ name: "username_1", key: { username: 1 }, unique: true }];
  mock.method(mongoose, "connect", () => { throw new Error("Tests must not connect to a database"); });
  mock.method(User.collection, "listIndexes", () => ({ toArray: async () => indexes }));
  mock.method(User, "findOne", ({ username }) => query([...users.values()].find((user) => user.username === username) || null));
  mock.method(User, "findById", (id) => query(users.get(String(id)) || null));
  mock.method(User, "find", async () => [...users.values()]);
  mock.method(User, "findByIdAndUpdate", (id, update) => { const user = users.get(id); if (user) Object.assign(user, update); return query(user || null); });
  mock.method(User.prototype, "save", async function () {
    if ([...users.values()].some((user) => user.username === this.username)) throw Object.assign(new Error("duplicate"), { code: 11000 });
    saves += 1; users.set(String(this._id), this); return this;
  });
  mock.method(Card, "find", (filter, projection) => listQuery(cards, filter, projection));
  mock.method(Card, "findOne", (filter) => query(cards.find((card) => matches(card, filter)) || null));
  mock.method(Card, "findOneAndUpdate", async (filter, update) => { const card = cards.find((item) => matches(item, filter)); if (card) Object.assign(card, update); return card || null; });
  mock.method(Card, "findOneAndDelete", async (filter) => { const index = cards.findIndex((item) => matches(item, filter)); return index < 0 ? null : cards.splice(index, 1)[0]; });
  mock.method(Card.prototype, "save", async function () { cards.push(this.toObject()); return this; });
  mock.method(Card, "aggregate", async () => [...users.keys()].map((_id) => ({ _id, count: cards.filter((card) => String(card.owner) === _id).length, files: cards.filter((card) => String(card.owner) === _id).map((card) => ({ images: card.imgURL, design: card.fabricEdit })) })));
  mock.method(Card, "countDocuments", async ({ owner }) => cards.filter((card) => String(card.owner) === String(owner)).length);
  mock.method(Template, "find", (filter, projection) => listQuery([{ _id: ids.template, name: "Public template" }], filter, projection));
  mock.method(Template, "findById", (id) => query(String(id) === ids.template ? { _id: ids.template, name: "Public template", fabricEdit: "https://template.example/design.json", imgURL: ["template-preview"] } : null));
  mock.method(cloudinary.uploader, "upload", async () => { throw new Error("Unexpected cloud write"); });
  mock.method(cloudinary.uploader, "upload_stream", () => { throw new Error("Unexpected cloud write"); });
});

test("private endpoints reject unauthenticated requests", async () => {
  for (const path of ["/api/cards", `/api/cards/${ids.card}`, "/api/users", "/api/users/me", "/api/templates"]) assert.equal((await request(path)).status, 401);
  for (const path of ["/api/users", "/api/cards", "/api/templates", "/api/upload-base64"]) assert.equal((await request(path, { method: "POST", body: {} })).status, 401);
});
test("registration auto-logins with a hashed password and never accepts admin/status/ownership fields", async () => {
  const result = await request("/api/users/register", { method: "POST", body: { username: "  New User  ", password: " abc12 ", role: "ADMIN", isAdmin: true, isActive: false, cards: [ids.card] } });
  assert.equal(result.status, 201); assert.equal(result.body.user.username, "New User"); assert.equal(result.body.user.isAdmin, false); assert.equal(result.body.user.isActive, true);
  assert.ok(!("password" in result.body.user)); assert.ok(!("cards" in result.body.user));
  const stored = users.get(String(result.body.user._id));
  assert.ok(await bcrypt.compare(" abc12 ", stored.password)); assert.notEqual(stored.password, " abc12 "); assert.deepEqual([...stored.cards], []);
  assert.equal(jwt.verify(result.body.token, SECRET).id, String(stored._id));
  assert.equal((await request("/api/users/me", { auth: result.body.token })).body.user._id, String(stored._id));
});
test("duplicate usernames return 409; case is preserved", async () => {
  assert.equal((await register({ username: "alice", password: "123456" })).status, 409);
  const upper = await register({ username: "Alice", password: "123456" });
  assert.equal(upper.status, 201); assert.equal(upper.body.user.username, "Alice");
});
test("simultaneous duplicate registrations only save one account", async () => {
  const results = await Promise.all([register({ username: "race", password: "123456" }), register({ username: "race", password: "123456" })]);
  assert.deepEqual(results.map((item) => item.status).sort(), [201, 409]); assert.equal(saves, 1);
});
test("registration rejects invalid types, empty fields, short and oversized bcrypt inputs", async () => {
  for (const body of [{}, { username: { $ne: null }, password: "123456" }, { username: " ", password: "123456" }, { username: "x", password: "12345" }, { username: "x", password: {} }, { username: "x".repeat(65), password: "123456" }, { username: "x", password: "é".repeat(37) }]) assert.equal((await register(body)).status, 400);
  assert.equal(saves, 0);
});
test("registration requires a verified full case-sensitive unique index and never creates one", async () => {
  for (const invalid of [[], [{ key: { username: 1 }, unique: false }], [{ key: { username: 1 }, unique: true, partialFilterExpression: { isAdmin: true } }], [{ key: { username: 1 }, unique: true, collation: { locale: "en", strength: 2 } }]]) {
    indexes = invalid; assert.equal(await hasUniqueUsernameIndex(), false); assert.equal((await register({ username: "new", password: "123456" })).status, 503);
  }
  assert.equal(saves, 0);
});
test("missing JWT configuration fails registration before saving", async () => {
  delete process.env.JWT_SECRET;
  assert.equal((await register({ username: "new", password: "123456" })).status, 503); assert.equal(saves, 0);
});
test("existing 6-character passwords still log in; errors are generic and hashes are excluded", async () => {
  const result = await request("/api/users/login", { method: "POST", body: { username: " alice ", password: "old123" } });
  assert.equal(result.status, 200); assert.ok(result.body.token); assert.ok(!JSON.stringify(result.body).includes(users.get(ids.alice).password));
  const bad = await request("/api/users/login", { method: "POST", body: { username: "alice", password: "wrong" } });
  const absent = await request("/api/users/login", { method: "POST", body: { username: "missing", password: "wrong" } });
  assert.equal(bad.status, 401); assert.deepEqual(bad.body, absent.body);
});
test("disabled users cannot log in or keep using issued tokens", async () => {
  users.get(ids.alice).isActive = false;
  const login = await request("/api/users/login", { method: "POST", body: { username: "alice", password: "old123" } });
  assert.equal(login.status, 403); assert.equal(login.body.code, "ACCOUNT_DISABLED");
  assert.equal((await request("/api/cards", { auth: token(ids.alice) })).status, 403);
});
test("expired, tampered, deleted-user and invalid-subject tokens are rejected", async () => {
  for (const value of [token(ids.alice, {}, { expiresIn: -1 }), token(ids.alice) + "x", token("999999999999999999999999"), token("not-an-id")]) assert.equal((await request("/api/cards", { auth: value })).status, 401);
});
test("a signed admin claim cannot elevate a nonadmin; revoked roles take effect immediately", async () => {
  assert.equal((await request("/api/users", { auth: token(ids.alice, { isAdmin: true }) })).status, 403);
  const previousAdmin = token(ids.admin, { isAdmin: true }); users.get(ids.admin).isAdmin = false;
  assert.equal((await request("/api/users", { auth: previousAdmin })).status, 403);
});
test("user listing and detail include owned drafts and completed cards only", async () => {
  const result = await request("/api/cards", { auth: token(ids.alice) }); assert.deepEqual(result.body.items.map((card) => card._id), [ids.draft, ids.card]);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth: token(ids.bob) })).status, 404);
  assert.equal((await request(`/api/cards/${ids.draft}`, { auth: token(ids.alice) })).status, 200);
});

test("card pages are bounded, newest ID first, private and omit design payloads", async () => {
  cards = Array.from({ length: 61 }, (_, i) => ({ _id: (i + 1).toString(16).padStart(24, "0"), owner: i % 2 ? ids.bob : ids.alice, cardName: `Card ${i}`, imgURL: ["preview", "extra-image"], fabricEdit: "PRIVATE_DESIGN", cardDESC: "HEAVY_DESCRIPTION" }));
  const auth = token(ids.alice);
  const first = await request("/api/cards", { auth });
  assert.equal(first.body.items.length, 24);
  assert.ok(first.body.nextCursor);
  assert.deepEqual(first.body.items[0].imgURL, ["preview"]);
  assert.ok(!JSON.stringify(first.body).includes("PRIVATE_DESIGN"));
  assert.ok(!JSON.stringify(first.body).includes("HEAVY_DESCRIPTION"));
  assert.ok(!("owner" in first.body.items[0]));
  const second = await request(`/api/cards?before=${first.body.nextCursor}`, { auth });
  assert.equal(second.body.items.length, 7);
  assert.equal(second.body.nextCursor, null);
  const all = [...first.body.items, ...second.body.items].map((card) => card._id);
  assert.equal(new Set(all).size, 31);
  assert.deepEqual(all, cards.filter((card) => card.owner === ids.alice).map((card) => card._id).sort().reverse());
  assert.equal((await request("/api/cards", { auth: token(ids.admin) })).body.items.length, 0);
});

test("pagination validates untrusted query values for both lists", async () => {
  for (const path of ["/api/cards", "/api/templates"]) {
    for (const params of ["limit=0", "limit=101", "limit=-1", "limit=1.5", "limit=1e2", "limit=24&limit=24", "before=bad", "before=", "before[x]=1"]) {
      assert.equal((await request(`${path}?${params}`, { auth: token(ids.alice) })).status, 400, `${path}?${params}`);
    }
  }
});

test("template list uses the same pagination and small projection; detail still supplies design", async () => {
  const templates = Array.from({ length: 5 }, (_, i) => ({ _id: (i + 1).toString(16).padStart(24, "0"), name: `Template ${i}`, imgURL: ["preview", "extra"], fabricEdit: "large-json" }));
  mock.method(Template, "find", (filter, projection) => listQuery(templates, filter, projection));
  const auth = token(ids.alice);
  let before;
  const seen = [];
  do {
    const result = await request(`/api/templates?limit=2${before ? `&before=${before}` : ""}`, { auth });
    assert.equal(result.status, 200);
    for (const item of result.body.items) { assert.ok(!("fabricEdit" in item)); assert.equal(item.imgURL.length, 1); seen.push(item._id); }
    before = result.body.nextCursor;
  } while (before);
  assert.equal(new Set(seen).size, 5);
  const detail = await request(`/api/templates/${ids.template}`, { auth });
  assert.equal(detail.body.fabricEdit, "https://template.example/design.json");
});
test("admins cannot read or edit other users' cards or unassigned legacy cards", async () => {
  const auth = token(ids.admin);
  assert.deepEqual((await request("/api/cards", { auth })).body, { items: [], nextCursor: null });
  assert.equal((await request(`/api/cards/${ids.card}`, { auth })).status, 404);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth, method: "PUT", body: { cardName: "stolen", fabricEdit: "{}" } })).status, 404);
  assert.equal((await request(`/api/cards/${ids.unassigned}`, { auth, method: "PUT", body: { isEditable: false } })).status, 404);
});
test("admin account endpoints return counts and metadata only, never card content or hashes", async () => {
  const auth = token(ids.admin);
  const listing = await request("/api/users", { auth });
  assert.equal(listing.status, 200); assert.equal(listing.body.find((user) => user._id === ids.alice).cardCount, 2);
  const detail = await request(`/api/users/${ids.alice}`, { auth }); assert.equal(detail.body.cardCount, 2);
  assert.equal(detail.body.fileCount, 2);
  assert.equal(listing.body.find((user) => user._id === ids.bob).fileCount, 0);
  for (const result of [listing, detail]) {
    const text = JSON.stringify(result.body);
    for (const privateText of ["SHOULD_NOT_LEAK", "fabricEdit", "alice-preview", "Alice private design", users.get(ids.alice).password]) assert.ok(!text.includes(privateText));
  }
});
test("account updates cannot change password, role, username or cards; nonadmins cannot toggle status", async () => {
  for (const body of [{ isAdmin: true }, { password: "reset123" }, { cards: [] }, { username: "renamed" }, { isActive: true, role: "ADMIN" }]) assert.equal((await request(`/api/users/${ids.alice}`, { auth: token(ids.admin), method: "PUT", body })).status, 400);
  assert.equal((await request(`/api/users/${ids.bob}`, { auth: token(ids.alice), method: "PUT", body: { isActive: false } })).status, 403);
  assert.equal((await request(`/api/users/${ids.admin}`, { auth: token(ids.admin), method: "PUT", body: { isActive: false } })).status, 400);
  const result = await request(`/api/users/${ids.alice}`, { auth: token(ids.admin), method: "PUT", body: { isActive: false } });
  assert.equal(result.status, 200); assert.equal(result.body.user.isActive, false); assert.ok(!("password" in result.body.user));
});
test("regular users may read templates but cannot mutate templates or admin accounts", async () => {
  const auth = token(ids.alice);
  assert.equal((await request("/api/templates", { auth })).status, 200);
  for (const [path, method] of [["/api/templates", "POST"], [`/api/templates/${ids.template}`, "PUT"], ["/api/users", "POST"]]) assert.equal((await request(path, { auth, method, body: {} })).status, 403);
});

test("user creates an owned card from a server-resolved template without mutating the template", async () => {
  const auth = token(ids.alice);
  const created = await request("/api/cards", { auth, method: "POST", body: { templateId: ids.template, cardName: "My card", isEditable: false } });
  assert.equal(created.status, 201);
  assert.equal(created.body.card.owner, ids.alice);
  assert.equal(created.body.card.fabricEdit, "https://template.example/design.json");
  assert.equal(created.body.card.isEditable, true);
  const id = created.body.card._id;
  assert.equal((await request(`/api/cards/${id}`, { auth })).status, 200);
  assert.equal((await request(`/api/cards/${id}`, { auth: token(ids.admin) })).status, 404);
  assert.equal((await request(`/api/cards/${id}`, { auth, method: "PUT", body: { cardName: "Edited" } })).status, 200);
  assert.equal((await request(`/api/templates/${ids.template}`, { auth })).body.name, "Public template");
});

test("creation validates template and rejects ownership spoofing before uploads", async () => {
  const auth = token(ids.alice);
  for (const [body, status] of [
    [{ cardName: "x" }, 400],
    [{ cardName: "x", templateId: "bad" }, 400],
    [{ cardName: "x", templateId: ids.bob }, 404],
    [{ cardName: "x", templateId: ids.template, owner: ids.bob }, 403],
    [{ cardName: "x", templateId: ids.template, fabricEdit: "{" }, 400],
  ]) assert.equal((await request("/api/cards", { auth, method: "POST", body })).status, status);
});

test("owner may edit completed cards; other users and admin cannot modify, transfer or delete them", async () => {
  for (const who of [ids.bob, ids.admin]) {
    for (const method of ["PUT", "DELETE"]) assert.equal((await request(`/api/cards/${ids.card}`, { auth: token(who), method, body: { cardName: "stolen" } })).status, 404);
  }
  const auth = token(ids.alice);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth, method: "PUT", body: { owner: ids.bob } })).status, 403);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth, method: "PUT", body: { fabricEdit: "broken" } })).status, 400);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth, method: "PUT", body: { cardName: "Updated", cardDESC: "Personal" } })).status, 200);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth, method: "DELETE" })).status, 200);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth })).status, 404);
  assert.equal((await request(`/api/cards/${ids.card}`, { auth, method: "DELETE" })).status, 404);
  assert.equal((await request(`/api/cards/${ids.draft}`, { method: "DELETE" })).status, 401);
});

test("saving a design uses a new JSON resource without changing the template", async () => {
  mock.method(cloudinary.uploader, "upload_stream", (options, callback) => {
    assert.equal(options.overwrite, false);
    return { end(buffer) { assert.deepEqual(JSON.parse(buffer.toString()).objects, []); callback(null, { secure_url: "https://new.example/design.json" }); } };
  });
  const result = await request(`/api/cards/${ids.card}`, { auth: token(ids.alice), method: "PUT", body: { fabricEdit: { objects: [] } } });
  assert.equal(result.status, 200);
  assert.equal(result.body.card.fabricEdit, "https://new.example/design.json");
  assert.deepEqual(result.body.card.imgURL, []);
});

test("file statistics deduplicate shared image and JSON references within each owner", async () => {
  cards.push({ _id: ids.template, owner: ids.alice, fabricEdit: cards[0].fabricEdit, imgURL: ["alice-preview", "alice-preview", "new-image"] });
  const detail = await request(`/api/users/${ids.alice}`, { auth: token(ids.admin) });
  assert.equal(detail.body.cardCount, 3);
  assert.equal(detail.body.fileCount, 3);
  assert.ok(!JSON.stringify(detail.body).includes("new-image"));
});

test("Fabric 7 images in groups and backgrounds are included; failed uploads abort save", async () => {
  const result = await processFabricEditImages({ objects: [{ type: "Group", objects: [{ type: "Image", src: "nested-image" }] }], backgroundImage: { type: "image", src: "background-image" } });
  assert.deepEqual(result.imgURLs, ["nested-image", "background-image"]);
  await assert.rejects(() => processFabricEditImages({ objects: [{ type: "Image", src: "data:image/png;base64,YQ==" }] }), /Unexpected cloud write/);
});
test("invalid IDs return 400 and uploads reject remote URLs/SVG before contacting Cloudinary", async () => {
  assert.equal((await request("/api/cards/bad-id", { auth: token(ids.alice) })).status, 400);
  for (const base64 of ["http://127.0.0.1/private", "data:image/svg+xml;base64,PHN2Zz4=", null]) assert.equal((await request("/api/upload-base64", { auth: token(ids.alice), method: "POST", body: { base64 } })).status, 400);
});
test("rate limiter returns Retry-After, isolates clients and expires windows", () => {
  let time = 0; const limit = createRateLimiter({ limit: 2, windowMs: 10000, now: () => time }); let allowed = 0;
  const call = (ip) => { const res = responseStub(); limit({ ip }, res, () => allowed++); return res; };
  call("one"); call("one"); const blocked = call("one"); assert.equal(blocked.statusCode, 429); assert.equal(blocked.headers["Retry-After"], "10");
  call("two"); assert.equal(allowed, 3); time = 10001; call("one"); assert.equal(allowed, 4);
});
test("public login and registration routes enforce their rate limits", async () => {
  let registration;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    registration = await request("/api/users/register", { method: "POST", body: { username: "alice", password: "123456" } });
  }
  assert.equal(registration.status, 429); assert.ok(Number(registration.headers.get("retry-after")) > 0);
  let login;
  for (let attempt = 0; attempt < 22; attempt += 1) {
    login = await request("/api/users/login", { method: "POST", body: { username: "not-an-account", password: "wrong" } });
  }
  assert.equal(login.status, 429); assert.ok(Number(login.headers.get("retry-after")) > 0);
  assert.equal(saves, 0);
});
