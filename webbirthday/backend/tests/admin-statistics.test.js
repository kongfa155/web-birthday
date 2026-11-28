import assert from "node:assert/strict";
import { after, before, beforeEach, test, mock } from "node:test";
import { once } from "node:events";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Card from "../models/Card.js";
import cloudinary from "../config/cloudinary.js";
import { createApp } from "../app.js";
import { cardStats } from "../utils/cardStats.js";

mongoose.set("bufferCommands", false);
const oldSecret = process.env.JWT_SECRET;
const SECRET = "test-only-admin-stats-secret";

const ids = {
  adminActive: "111111111111111111111111",
  adminDisabled: "111111111111111111111112",
  alice: "222222222222222222222222",
  bobDisabled: "333333333333333333333333",
  legacyUser: "444444444444444444444444",
};

let users;
let cards;
let url;
let server;
let lastUserCountFilter;
let lastCardCountFilter;

const token = (id, extra = {}) => jwt.sign({ id, ...extra }, SECRET, { expiresIn: "1h" });
const query = (value) => ({
  select: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

function matchesUserFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;
  if (filter.isAdmin && typeof filter.isAdmin === "object" && "$ne" in filter.isAdmin) {
    return doc.isAdmin !== filter.isAdmin.$ne;
  }
  return true;
}

async function request(path, { method = "GET", auth } = {}) {
  const response = await fetch(url + path, {
    method,
    headers: {
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
    },
  });
  return { status: response.status, body: await response.json() };
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
  if (oldSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = oldSecret;
});

beforeEach(() => {
  mock.restoreAll();
  process.env.JWT_SECRET = SECRET;
  lastUserCountFilter = null;
  lastCardCountFilter = null;

  users = new Map([
    [ids.adminActive, { _id: ids.adminActive, username: "admin", password: "HASH_ADMIN_SECRET", isAdmin: true, isActive: true, createdAt: new Date("2026-01-01"), cards: ["SHOULD_NOT_LEAK"] }],
    [ids.adminDisabled, { _id: ids.adminDisabled, username: "admin2", password: "HASH_ADMIN2_SECRET", isAdmin: true, isActive: false, createdAt: new Date("2026-01-02") }],
    [ids.alice, { _id: ids.alice, username: "alice", password: "HASH_ALICE_SECRET", isAdmin: false, isActive: true, createdAt: new Date("2026-01-03"), cards: ["SHOULD_NOT_LEAK"] }],
    [ids.bobDisabled, { _id: ids.bobDisabled, username: "bob", password: "HASH_BOB_SECRET", isAdmin: false, isActive: false, createdAt: new Date("2026-01-04") }],
    [ids.legacyUser, { _id: ids.legacyUser, username: "legacy", password: "HASH_LEGACY_SECRET", isActive: true, createdAt: new Date("2026-01-05") }],
  ]);

  cards = [
    { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", owner: ids.alice, cardName: "Secret Alice Card", fabricEdit: "https://private.example/alice.json", imgURL: ["https://private.example/alice.png"], designUrl: "https://private.example/design.json", previewUrl: "https://private.example/preview.png" },
    { _id: "aaaaaaaaaaaaaaaaaaaaaaab", owner: ids.alice, cardName: "Alice Draft", fabricEdit: "https://private.example/alice2.json", imgURL: ["https://private.example/alice2.png"] },
    { _id: "aaaaaaaaaaaaaaaaaaaaaaac", owner: ids.bobDisabled, cardName: "Disabled User Card", fabricEdit: "https://private.example/bob.json" },
    { _id: "aaaaaaaaaaaaaaaaaaaaaaad", owner: ids.adminActive, cardName: "Admin Owned Card", fabricEdit: "https://private.example/admin.json" },
    { _id: "aaaaaaaaaaaaaaaaaaaaaaae", owner: null, cardName: "Unassigned Card" },
  ];

  mock.method(mongoose, "connect", () => {
    throw new Error("Tests must not connect to a database");
  });
  mock.method(User.collection, "listIndexes", () => ({
    toArray: async () => [{ name: "username_1", key: { username: 1 }, unique: true }],
  }));
  mock.method(User, "findById", (id) => query(users.get(String(id)) || null));
  mock.method(User, "find", async () => [...users.values()]);
  mock.method(User, "countDocuments", async (filter = {}) => {
    lastUserCountFilter = filter;
    return [...users.values()].filter((doc) => matchesUserFilter(doc, filter)).length;
  });
  mock.method(Card, "countDocuments", async (filter = {}) => {
    lastCardCountFilter = filter;
    return cards.length;
  });
  mock.method(Card, "aggregate", async (pipeline) => {
    const matchStage = pipeline.find((stage) => "$match" in stage);
    const ownerIds = new Set((matchStage?.$match?.owner?.$in || []).map(String));
    const counts = new Map();
    for (const card of cards) {
      if (card.owner == null) continue;
      const ownerId = String(card.owner);
      if (!ownerIds.has(ownerId)) continue;
      counts.set(ownerId, (counts.get(ownerId) || 0) + 1);
    }
    return [...counts.entries()].map(([_id, count]) => ({ _id, count }));
  });
  mock.method(cloudinary.uploader, "upload", async () => {
    throw new Error("Unexpected cloud write");
  });
  mock.method(cloudinary.uploader, "upload_stream", () => {
    throw new Error("Unexpected cloud write");
  });
});

test("GET /api/users/stats counts only non-admin users (active and disabled) and all cards without leaks", async () => {
  const res = await request("/api/users/stats", { auth: token(ids.adminActive) });

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["cardCount", "userCount"]);
  assert.deepEqual(res.body, { userCount: 3, cardCount: 5 });
  assert.deepEqual(lastUserCountFilter, { isAdmin: { $ne: true } });
  assert.deepEqual(lastCardCountFilter, {});

  const serialized = JSON.stringify(res.body);
  for (const sensitive of ["fileCount", "SHOULD_NOT_LEAK", "HASH_", "private.example", "Secret Alice Card"]) {
    assert.ok(!serialized.includes(sensitive));
  }
});

test("GET /api/users/stats returns zero counts cleanly when no non-admin users or cards exist", async () => {
  users = new Map([
    [ids.adminActive, { _id: ids.adminActive, username: "admin", password: "HASH_ADMIN_SECRET", isAdmin: true, isActive: true }],
  ]);
  cards = [];

  const res = await request("/api/users/stats", { auth: token(ids.adminActive) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { userCount: 0, cardCount: 0 });
});

test("GET /api/users/stats enforces authentication and admin authorization", async () => {
  assert.equal((await request("/api/users/stats")).status, 401);
  assert.equal((await request("/api/users/stats", { auth: token(ids.alice) })).status, 403);
  assert.equal((await request("/api/users/stats", { auth: token(ids.alice, { isAdmin: true }) })).status, 403);

  const disabledAdmin = await request("/api/users/stats", { auth: token(ids.adminDisabled) });
  assert.equal(disabledAdmin.status, 403);
  assert.equal(disabledAdmin.body.code, "ACCOUNT_DISABLED");
});

test("GET /api/users/stats returns generic 500 without leaking internal database errors", async () => {
  mock.method(User, "countDocuments", async () => {
    throw new Error("mongodb://admin:supersecret@10.0.0.1:27017/birthday failure");
  });
  const userFail = await request("/api/users/stats", { auth: token(ids.adminActive) });
  assert.equal(userFail.status, 500);
  assert.deepEqual(Object.keys(userFail.body), ["message"]);
  assert.ok(!JSON.stringify(userFail.body).includes("supersecret"));
  assert.ok(!JSON.stringify(userFail.body).includes("mongodb://"));

  mock.restoreAll();
  mock.method(User, "findById", (id) => query(users.get(String(id)) || null));
  mock.method(User, "countDocuments", async () => 2);
  mock.method(Card, "countDocuments", async () => {
    throw new Error("internal Card collection stack trace");
  });
  const cardFail = await request("/api/users/stats", { auth: token(ids.adminActive) });
  assert.equal(cardFail.status, 500);
  assert.deepEqual(Object.keys(cardFail.body), ["message"]);
  assert.ok(!JSON.stringify(cardFail.body).includes("stack trace"));
});

test("admin user listing and detail omit fileCount and never leak card content or URLs", async () => {
  const auth = token(ids.adminActive);
  const listRes = await request("/api/users", { auth });
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body));
  assert.equal(listRes.body.length, 5);

  const aliceItem = listRes.body.find((item) => item._id === ids.alice);
  const legacyItem = listRes.body.find((item) => item._id === ids.legacyUser);
  assert.equal(aliceItem.cardCount, 2);
  assert.equal(legacyItem.cardCount, 0);

  for (const item of listRes.body) {
    assert.ok(!("fileCount" in item));
    assert.ok(!("password" in item));
    assert.ok(!("cards" in item));
  }

  const detailRes = await request(`/api/users/${ids.alice}`, { auth });
  assert.equal(detailRes.status, 200);
  assert.equal(detailRes.body.cardCount, 2);
  assert.ok(!("fileCount" in detailRes.body));

  const combined = JSON.stringify([listRes.body, detailRes.body]);
  for (const privateText of [
    "fileCount",
    "SHOULD_NOT_LEAK",
    "HASH_",
    "private.example",
    "Secret Alice Card",
    "fabricEdit",
    "imgURL",
    "designUrl",
    "previewUrl",
  ]) {
    assert.ok(!combined.includes(privateText));
  }
});

test("cardStats aggregates counts only without collecting URL fields", async () => {
  let capturedPipeline = null;
  mock.method(Card, "aggregate", async (pipeline) => {
    capturedPipeline = pipeline;
    return [{ _id: ids.alice, count: 2 }];
  });

  const emptyResult = await cardStats([]);
  assert.equal(emptyResult.size, 0);
  assert.equal(capturedPipeline, null);

  const statsMap = await cardStats([ids.alice, ids.legacyUser]);
  assert.ok(Array.isArray(capturedPipeline));
  const serializedPipeline = JSON.stringify(capturedPipeline);
  for (const urlField of ["$push", "imgURL", "fabricEdit", "designUrl", "previewUrl"]) {
    assert.ok(!serializedPipeline.includes(urlField));
  }

  assert.deepEqual(statsMap.get(ids.alice), { cardCount: 2 });
  assert.ok(!("fileCount" in statsMap.get(ids.alice)));
  assert.equal(statsMap.get(ids.legacyUser), undefined);
});
