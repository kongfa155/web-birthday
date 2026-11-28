import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, mock, test } from "node:test";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import { createApp } from "../app.js";
import Card, {
  CARD_SHARE_INDEX_KEY,
  CARD_SHARE_INDEX_OPTIONS,
} from "../models/Card.js";
import Template from "../models/Template.js";
import User from "../models/User.js";
import {
  ensureCardShareIndex,
  matchesApprovedCardShareIndex,
  parseShareIndexArgs,
} from "../scripts/ensure-card-share-index.js";
import { listQuery } from "./helpers/listQuery.js";

mongoose.set("bufferCommands", false);

const oldSecret = process.env.JWT_SECRET;
const SECRET = "test-only-share-secret-not-a-real-credential";
const ids = {
  admin: "111111111111111111111111",
  alice: "222222222222222222222222",
  bob: "333333333333333333333333",
  card: "444444444444444444444444",
  legacy: "555555555555555555555555",
  unassigned: "666666666666666666666666",
  template: "777777777777777777777777",
};

let users, cards, url, server, findOneCalls;

const authToken = (id) => jwt.sign({ id }, SECRET, { expiresIn: "1h" });
const sha256Hex = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((item) => matches(doc, item));
    if (value === null) return doc[key] == null;
    if (typeof value === "boolean") return doc[key] === value;
    return String(doc[key]) === String(value);
  });
}

function defaultHiddenFields() {
  return Object.entries(Card.schema.paths)
    .filter(([, schemaType]) => schemaType.options?.select === false)
    .map(([path]) => path);
}

function projectCardDoc(doc, selectSpec) {
  if (!doc) return null;
  const hidden = new Set(defaultHiddenFields());

  if (!selectSpec) {
    const out = {};
    for (const [key, value] of Object.entries(doc)) {
      if (!hidden.has(key) && value !== undefined) out[key] = value;
    }
    return out;
  }

  const tokens =
    typeof selectSpec === "string"
      ? selectSpec.trim().split(/\s+/).filter(Boolean)
      : Object.entries(selectSpec)
          .filter(([, v]) => v)
          .map(([k]) => k);

  const out = {};
  if (doc._id !== undefined && !tokens.includes("-_id")) {
    out._id = doc._id;
  }
  for (const token of tokens) {
    if (token.startsWith("-")) continue;
    const key = token.startsWith("+") ? token.slice(1) : token;
    if (doc[key] !== undefined) out[key] = doc[key];
  }
  return out;
}

function applyMongoUpdate(doc, update) {
  if (update.$set && typeof update.$set === "object") {
    Object.assign(doc, update.$set);
  }
  if (update.$unset && typeof update.$unset === "object") {
    for (const key of Object.keys(update.$unset)) {
      delete doc[key];
    }
  }
  for (const [key, value] of Object.entries(update)) {
    if (!key.startsWith("$")) {
      doc[key] = value;
    }
  }
}

function cardQuery(doc) {
  let selectSpec = null;
  const q = {
    select(spec) {
      selectSpec = spec;
      return q;
    },
    populate() {
      return q;
    },
    collation() {
      return q;
    },
    then(resolve, reject) {
      return Promise.resolve(projectCardDoc(doc, selectSpec)).then(
        resolve,
        reject
      );
    },
  };
  return q;
}

const userQuery = (value) => ({
  select: async () => value,
  collation: async () => value,
  populate: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

async function request(path, { method = "GET", body, auth, rawAuth } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (rawAuth) headers.Authorization = rawAuth;
  else if (auth) headers.Authorization = `Bearer ${auth}`;

  const response = await fetch(url + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

function assertShareHeaders(headers, context = "") {
  assert.equal(headers.get("cache-control"), "no-store", `cache-control ${context}`);
  assert.equal(
    headers.get("referrer-policy"),
    "no-referrer",
    `referrer-policy ${context}`
  );
  assert.equal(headers.get("x-robots-tag"), "noindex", `x-robots-tag ${context}`);
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
  findOneCalls = [];

  users = new Map([
    [ids.admin, { _id: ids.admin, username: "admin", isAdmin: true, isActive: true }],
    [ids.alice, { _id: ids.alice, username: "alice", isAdmin: false, isActive: true }],
    [ids.bob, { _id: ids.bob, username: "bob", isAdmin: false, isActive: true }],
  ]);

  cards = [
    {
      _id: ids.card,
      cardName: "Alice birthday card",
      cardDESC: "Happy Birthday!",
      designUrl: "https://cdn.example/alice-card.json",
      designFormat: "dom",
      previewUrl: "https://cdn.example/alice-preview.png",
      imgURL: ["https://cdn.example/alice-preview.png"],
      owner: ids.alice,
      isEditable: false,
      shareEnabled: false,
    },
    {
      _id: ids.legacy,
      cardName: "Legacy card without share fields",
      owner: ids.alice,
      isEditable: true,
    },
    {
      _id: ids.unassigned,
      cardName: "Legacy unassigned",
      owner: null,
      isEditable: true,
      shareEnabled: false,
    },
  ];

  mock.method(mongoose, "connect", () => {
    throw new Error("Tests must not connect to a database");
  });
  mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {},
  }));
  mock.method(User, "findById", (id) => userQuery(users.get(String(id)) || null));
  mock.method(User, "updateOne", async (filter, update) => {
    const user = users.get(String(filter._id));
    if (!user || user.isAdmin === true || user.isActive === false) return { matchedCount: 0 };
    if (update?.$inc?.__v) user.__v = (user.__v || 0) + update.$inc.__v;
    return { matchedCount: 1 };
  });
  mock.method(Card, "countDocuments", async ({ owner }) =>
    cards.filter((card) => String(card.owner) === String(owner)).length
  );
  mock.method(Card, "find", (filter, projection) =>
    listQuery(cards, filter, projection)
  );
  mock.method(Card, "findOne", (filter) => {
    findOneCalls.push(filter);
    return cardQuery(cards.find((card) => matches(card, filter)) || null);
  });
  mock.method(Card, "findOneAndUpdate", (filter, update) => {
    const card = cards.find((item) => matches(item, filter)) || null;
    if (card) applyMongoUpdate(card, update);
    return cardQuery(card);
  });
  mock.method(Card, "findOneAndDelete", async (filter) => {
    const index = cards.findIndex((item) => matches(item, filter));
    return index < 0 ? null : cards.splice(index, 1)[0];
  });
  mock.method(Card.prototype, "save", async function () {
    const obj = this.toObject();
    cards.push(obj);
    return this;
  });
  mock.method(Template, "findById", (id) =>
    userQuery(
      String(id) === ids.template
        ? {
            _id: ids.template,
            name: "Birthday Template",
            designUrl: "https://cdn.example/template.json",
            designFormat: "dom",
            previewUrl: "https://cdn.example/template.png",
            imgURL: ["https://cdn.example/template.png"],
          }
        : null
    )
  );
  mock.method(cloudinary.uploader, "upload", async () => {
    throw new Error("Unexpected cloud write");
  });
  mock.method(cloudinary.uploader, "upload_stream", () => {
    throw new Error("Unexpected cloud write");
  });
});

test("Card Mongoose schema enforces shareEnabled default false, shareTokenHash select:false, and approved partial unique index", () => {
  const shareEnabledPath = Card.schema.path("shareEnabled");
  const shareTokenHashPath = Card.schema.path("shareTokenHash");
  assert.equal(shareEnabledPath.instance, "Boolean");
  assert.equal(shareEnabledPath.options.default, false);
  assert.equal(shareTokenHashPath.instance, "String");
  assert.equal(shareTokenHashPath.options.select, false);

  const doc = new Card({ cardName: "Schema check", shareTokenHash: "secret-hash-hex" });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.shareEnabled, false);
  assert.ok(!("shareTokenHash" in doc.toJSON()));

  const declared = Card.schema.indexes().find(([key]) => key.shareTokenHash === 1);
  assert.ok(declared);
  assert.deepEqual(declared[0], CARD_SHARE_INDEX_KEY);
  assert.equal(declared[1].name, "shareTokenHash_unique");
  assert.equal(declared[1].unique, true);
  assert.deepEqual(declared[1].partialFilterExpression, {
    shareTokenHash: { $type: "string" },
  });
  assert.equal(
    matchesApprovedCardShareIndex({
      key: declared[0],
      ...declared[1],
    }),
    true
  );
});

test("anonymous, invalid-id, and disabled-user owner share requests are blocked with share headers", async () => {
  for (const method of ["GET", "POST", "DELETE"]) {
    const anon = await request(`/api/cards/${ids.card}/share`, { method });
    assert.equal(anon.status, 401);
    assertShareHeaders(anon.headers, `${method} anon`);

    const badId = await request("/api/cards/not-a-valid-id/share", {
      method,
      auth: authToken(ids.alice),
    });
    assert.equal(badId.status, 400);
    assertShareHeaders(badId.headers, `${method} badId`);
  }

  users.get(ids.alice).isActive = false;
  const disabled = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: authToken(ids.alice),
  });
  assert.equal(disabled.status, 403);
  assertShareHeaders(disabled.headers, "disabled user");
});

test("owner-only share APIs deny other users, admins, and unassigned legacy cards", async () => {
  for (const actor of [ids.bob, ids.admin]) {
    for (const cardId of [ids.card, ids.unassigned]) {
      for (const method of ["GET", "POST", "DELETE"]) {
        const res = await request(`/api/cards/${cardId}/share`, {
          method,
          auth: authToken(actor),
        });
        assert.equal(res.status, 404);
        assertShareHeaders(res.headers, `${actor} ${method} ${cardId}`);
      }
    }
  }
});

test("legacy cards without share fields default to disabled/private", async () => {
  const status = await request(`/api/cards/${ids.legacy}/share`, {
    auth: authToken(ids.alice),
  });
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { shareEnabled: false });
  assertShareHeaders(status.headers, "legacy status");
});

test("creating share stores SHA-256 hash not raw token and never leaks token or hash across endpoints", async () => {
  const aliceAuth = authToken(ids.alice);
  const created = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: aliceAuth,
    body: {
      shareToken: "client-supplied-token-must-be-ignored",
      shareTokenHash: "client-supplied-hash",
      owner: ids.bob,
    },
  });
  assert.equal(created.status, 200);
  assertShareHeaders(created.headers, "create share");
  assert.equal(created.body.shareEnabled, true);
  assert.match(created.body.shareToken, /^[A-Za-z0-9_-]{43}$/);

  const rawToken = created.body.shareToken;
  const expectedHash = sha256Hex(rawToken);
  const stored = cards.find((c) => c._id === ids.card);
  assert.equal(stored.shareEnabled, true);
  assert.equal(stored.shareTokenHash, expectedHash);
  assert.notEqual(stored.shareTokenHash, rawToken);
  assert.equal(stored.owner, ids.alice);

  const ownerStatus = await request(`/api/cards/${ids.card}/share`, {
    auth: aliceAuth,
  });
  assert.equal(ownerStatus.status, 200);
  assert.deepEqual(ownerStatus.body, { shareEnabled: true });
  assertShareHeaders(ownerStatus.headers, "owner status");

  const listRes = await request("/api/cards", { auth: aliceAuth });
  assert.equal(listRes.status, 200);
  const detailRes = await request(`/api/cards/${ids.card}`, { auth: aliceAuth });
  assert.equal(detailRes.status, 200);
  const updateRes = await request(`/api/cards/${ids.card}`, {
    method: "PUT",
    auth: aliceAuth,
    body: {
      cardName: "Updated birthday card",
      cardDESC: "Updated wish",
      shareEnabled: false,
      shareTokenHash: "forged-hash",
    },
  });
  assert.equal(updateRes.status, 200);

  const createOrdinaryRes = await request("/api/cards", {
    method: "POST",
    auth: aliceAuth,
    body: {
      templateId: ids.template,
      cardName: "New card ignoring share fields",
      shareEnabled: true,
      shareTokenHash: "forged-hash",
    },
  });
  assert.equal(createOrdinaryRes.status, 201);
  assert.equal(createOrdinaryRes.body.card.shareEnabled, false);

  for (const res of [ownerStatus, listRes, detailRes, updateRes, createOrdinaryRes]) {
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes(rawToken));
    assert.ok(!serialized.includes(expectedHash));
    assert.ok(!serialized.includes("shareTokenHash"));
  }
  assert.equal(stored.shareEnabled, true);
  assert.equal(stored.shareTokenHash, expectedHash);

  const publicRes = await request(`/api/shared-cards/${rawToken}`);
  assert.equal(publicRes.status, 200);
  assertShareHeaders(publicRes.headers, "public read");
  assert.deepEqual(Object.keys(publicRes.body).sort(), [
    "cardDESC",
    "cardName",
    "designFormat",
    "designUrl",
    "previewUrl",
  ]);
  assert.equal(publicRes.body.cardName, "Updated birthday card");
  assert.equal(publicRes.body.cardDESC, "Updated wish");
  assert.equal(
    publicRes.body.designUrl,
    "https://cdn.example/alice-card.json"
  );
  assert.equal(publicRes.body.designFormat, "dom");
  assert.equal(
    publicRes.body.previewUrl,
    "https://cdn.example/alice-preview.png"
  );
  assert.ok(!("fabricEdit" in publicRes.body));
  assert.ok(!JSON.stringify(publicRes.body).includes(rawToken));
  assert.ok(!JSON.stringify(publicRes.body).includes(expectedHash));
});

test("public shared card stays accessible unauthenticated and with unrelated bad Authorization", async () => {
  const created = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: authToken(ids.alice),
  });
  const shareToken = created.body.shareToken;

  const anon = await request(`/api/shared-cards/${shareToken}`);
  assert.equal(anon.status, 200);
  assertShareHeaders(anon.headers, "public anon");

  const withBadAuth = await request(`/api/shared-cards/${shareToken}`, {
    rawAuth: "Bearer completely.invalid.jwt",
  });
  assert.equal(withBadAuth.status, 200);
  assert.deepEqual(withBadAuth.body, anon.body);
  assertShareHeaders(withBadAuth.headers, "public bad auth");
});

test("rotate invalidates old token; revoke is idempotent and re-enable issues a new token", async () => {
  const aliceAuth = authToken(ids.alice);
  const first = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: aliceAuth,
  });
  const token1 = first.body.shareToken;

  const rotated = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: aliceAuth,
  });
  const token2 = rotated.body.shareToken;
  assert.notEqual(token2, token1);

  const oldPublic = await request(`/api/shared-cards/${token1}`);
  assert.equal(oldPublic.status, 404);
  assertShareHeaders(oldPublic.headers, "rotated old token");
  assert.equal((await request(`/api/shared-cards/${token2}`)).status, 200);

  const revoked1 = await request(`/api/cards/${ids.card}/share`, {
    method: "DELETE",
    auth: aliceAuth,
  });
  assert.equal(revoked1.status, 200);
  assert.deepEqual(revoked1.body, { shareEnabled: false });
  assertShareHeaders(revoked1.headers, "revoke 1");

  const stored = cards.find((c) => c._id === ids.card);
  assert.equal(stored.shareEnabled, false);
  assert.ok(!("shareTokenHash" in stored));

  const revokedRead = await request(`/api/shared-cards/${token2}`);
  assert.equal(revokedRead.status, 404);
  assert.deepEqual(revokedRead.body, oldPublic.body);

  const revoked2 = await request(`/api/cards/${ids.card}/share`, {
    method: "DELETE",
    auth: aliceAuth,
  });
  assert.equal(revoked2.status, 200);
  assert.deepEqual(revoked2.body, { shareEnabled: false });
  assertShareHeaders(revoked2.headers, "revoke idempotent");

  const reenabled = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: aliceAuth,
  });
  const token3 = reenabled.body.shareToken;
  assert.notEqual(token3, token1);
  assert.notEqual(token3, token2);
  assert.equal((await request(`/api/shared-cards/${token1}`)).status, 404);
  assert.equal((await request(`/api/shared-cards/${token2}`)).status, 404);
  assert.equal((await request(`/api/shared-cards/${token3}`)).status, 200);
});

test("card deletion revokes active shared link and rejects non-GET public methods", async () => {
  const aliceAuth = authToken(ids.alice);
  const created = await request(`/api/cards/${ids.card}/share`, {
    method: "POST",
    auth: aliceAuth,
  });
  const shareToken = created.body.shareToken;

  for (const method of ["PUT", "POST", "DELETE", "PATCH"]) {
    const writeAttempt = await request(`/api/shared-cards/${shareToken}`, {
      method,
      body: { cardName: "Tampered" },
    });
    assert.equal(writeAttempt.status, 404);
    assertShareHeaders(writeAttempt.headers, `public ${method}`);
  }

  const deleted = await request(`/api/cards/${ids.card}`, {
    method: "DELETE",
    auth: aliceAuth,
  });
  assert.equal(deleted.status, 200);

  const afterDeletePublic = await request(`/api/shared-cards/${shareToken}`);
  assert.equal(afterDeletePublic.status, 404);
  assertShareHeaders(afterDeletePublic.headers, "after delete public");

  const afterDeleteOwner = await request(`/api/cards/${ids.card}/share`, {
    auth: aliceAuth,
  });
  assert.equal(afterDeleteOwner.status, 404);
  assertShareHeaders(afterDeleteOwner.headers, "after delete owner");
});

test("invalid token formats, lengths, and injection attempts return uniform 404 without querying DB", async () => {
  const validMissing = await request(
    `/api/shared-cards/${"a".repeat(43)}`
  );
  assert.equal(validMissing.status, 404);
  assertShareHeaders(validMissing.headers, "valid missing");

  findOneCalls = [];
  const invalidPaths = [
    "/api/shared-cards/",
    `/api/shared-cards/${"a".repeat(42)}`,
    `/api/shared-cards/${"a".repeat(44)}`,
    `/api/shared-cards/${"a".repeat(42)}=`,
    `/api/shared-cards/${"a".repeat(41)}+/`,
    "/api/shared-cards/%7B%22%24ne%22%3A%22x%22%7D",
    `/api/shared-cards/${"a".repeat(42)}%00`,
    `/api/shared-cards/${"é".repeat(43)}`,
    `/api/shared-cards/${"a".repeat(43)}/extra`,
  ];

  for (const path of invalidPaths) {
    const res = await request(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(res.body, validMissing.body, path);
    assertShareHeaders(res.headers, path);
  }
  assert.equal(findOneCalls.length, 0);
});

test("database failures return generic errors with share headers and never expose internals or tokens", async () => {
  const aliceAuth = authToken(ids.alice);
  const boom = () => {
    throw new Error("mongodb+srv://admin:supersecret@cluster.example/webbirthday");
  };
  mock.method(Card, "findOne", boom);
  mock.method(Card, "findOneAndUpdate", boom);

  const calls = [
    await request(`/api/cards/${ids.card}/share`, { auth: aliceAuth }),
    await request(`/api/cards/${ids.card}/share`, { method: "POST", auth: aliceAuth }),
    await request(`/api/cards/${ids.card}/share`, { method: "DELETE", auth: aliceAuth }),
    await request(`/api/shared-cards/${"b".repeat(43)}`),
  ];

  for (const res of calls) {
    assert.equal(res.status, 500);
    assertShareHeaders(res.headers, "500 error");
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes("mongodb+srv"));
    assert.ok(!text.includes("supersecret"));
    assert.ok(!text.includes("bbbb"));
  }
});

test("pre-existing shareTokenHash is omitted from owner card APIs and malformed JSON on share endpoint keeps share headers", async () => {
  const aliceAuth = authToken(ids.alice);
  cards[0].shareEnabled = true;
  cards[0].shareTokenHash = sha256Hex("d".repeat(43));

  const detail = await request(`/api/cards/${ids.card}`, { auth: aliceAuth });
  assert.equal(detail.status, 200);
  assert.ok(!("shareTokenHash" in detail.body));
  assert.ok(!JSON.stringify(detail.body).includes(cards[0].shareTokenHash));

  const badJsonRes = await fetch(`${url}/api/cards/${ids.card}/share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aliceAuth}`,
      "Content-Type": "application/json",
    },
    body: "{invalid-json",
  });
  assert.equal(badJsonRes.status, 400);
  assertShareHeaders(badJsonRes.headers, "malformed json share request");
});

test("ensure-card-share-index script respects dry-run, --apply, conflicts, and missing collection without live DB", async () => {
  assert.deepEqual(parseShareIndexArgs([]), { apply: false });
  assert.deepEqual(parseShareIndexArgs(["--apply"]), { apply: true });
  assert.throws(() => parseShareIndexArgs(["--force"]));
  assert.equal(matchesApprovedCardShareIndex({ key: CARD_SHARE_INDEX_KEY, ...CARD_SHARE_INDEX_OPTIONS, partialFilterExpression: { shareTokenHash: { $type: "string", $gt: "a" } } }), false);

  const logs = [];
  const logger = {
    log: (m) => logs.push(m),
    error: (m) => logs.push(m),
  };

  let createdCalls = [];
  let indexes = [{ name: "_id_", key: { _id: 1 } }];
  let collections = [{ name: "cards" }];

  const mockDb = {
    listCollections: () => ({ toArray: async () => collections }),
  };
  const mockCollection = {
    listIndexes: () => ({ toArray: async () => indexes }),
    createIndex: async (key, options) => {
      createdCalls.push({ key, options });
      indexes.push({ key, ...options });
    },
  };

  const dry = await ensureCardShareIndex({
    db: mockDb,
    collection: mockCollection,
    collectionName: "cards",
    apply: false,
    logger,
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.status, "dry_run");
  assert.equal(createdCalls.length, 0);

  const applied = await ensureCardShareIndex({
    db: mockDb,
    collection: mockCollection,
    collectionName: "cards",
    apply: true,
    logger,
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.status, "created");
  assert.equal(createdCalls.length, 1);
  assert.deepEqual(createdCalls[0].key, CARD_SHARE_INDEX_KEY);
  assert.deepEqual(createdCalls[0].options, CARD_SHARE_INDEX_OPTIONS);

  const existing = await ensureCardShareIndex({
    db: mockDb,
    collection: mockCollection,
    collectionName: "cards",
    apply: true,
    logger,
  });
  assert.equal(existing.ok, true);
  assert.equal(existing.status, "already_exists");
  assert.equal(createdCalls.length, 1);

  indexes = [{ name: "shareTokenHash_1", key: { shareTokenHash: 1 }, unique: true }];
  const conflict = await ensureCardShareIndex({
    db: mockDb,
    collection: mockCollection,
    collectionName: "cards",
    apply: true,
    logger,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, "conflict");
  assert.equal(createdCalls.length, 1);

  collections = [];
  const missingCol = await ensureCardShareIndex({
    db: mockDb,
    collection: mockCollection,
    collectionName: "cards",
    apply: true,
    logger,
  });
  assert.equal(missingCol.ok, false);
  assert.equal(missingCol.status, "missing_collection");
});

test("public shared-cards endpoint enforces 120/min/IP rate limit with share headers", async () => {
  const token = "c".repeat(43);
  let limited = null;
  for (let i = 0; i < 125; i += 1) {
    const res = await request(`/api/shared-cards/${token}`);
    assertShareHeaders(res.headers, `rate limit step ${i}`);
    if (res.status === 429) {
      limited = res;
      break;
    }
  }
  assert.ok(limited, "Expected 429 response within 125 requests");
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assertShareHeaders(limited.headers, "429 response");
});
