import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";
import Card from "../models/Card.js";
import Template from "../models/Template.js";
import CardController from "../controllers/CardController.js";
import {
  MAX_USER_CARDS,
  CardCreationError,
  createCardWithinQuota,
} from "../utils/cardCreationQuota.js";
import { normalizeDomDesign } from "../../shared/designSchema.js";

mongoose.set("bufferCommands", false);

const ids = {
  user: "222222222222222222222222",
  admin: "111111111111111111111111",
  template: "777777777777777777777777",
};

const preview = "data:image/png;base64,aGVsbG8=";
const domDesign = () =>
  normalizeDomDesign({
    schemaVersion: 1,
    width: 1080,
    height: 1440,
    background: "#ffffff",
    elements: [
      {
        id: "photo",
        type: "image",
        src: preview,
        x: 50,
        y: 50,
        width: 200,
        height: 200,
      },
    ],
  });

function responseStub() {
  return {
    code: 200,
    body: null,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createMockSession({ retries = 0, transactionError = null } = {}) {
  const session = {
    id: "mock-session",
    ended: 0,
    withTransactionCalls: 0,
    async withTransaction(fn, options) {
      this.withTransactionCalls += 1;
      this.lastOptions = options;
      if (transactionError) throw transactionError;
      let attempt = 0;
      while (true) {
        try {
          return await fn();
        } catch (err) {
          if (attempt < retries && err?.retryable) {
            attempt += 1;
            continue;
          }
          throw err;
        }
      }
    },
    async endSession() {
      this.ended += 1;
    },
  };
  return session;
}

beforeEach(() => {
  mock.method(mongoose, "connect", () => {
    throw new Error("No database connections in tests");
  });
});

afterEach(() => mock.restoreAll());

test("under 20 cards succeeds, serializes on users.__v with timestamps:false before counting, and ends session", async () => {
  const events = [];
  const session = createMockSession();
  let updateCall;
  let countCall;
  let saveOptions;

  mock.method(mongoose, "startSession", async () => {
    events.push("startSession");
    return session;
  });
  mock.method(User, "updateOne", async (filter, update, options) => {
    events.push("User.updateOne");
    updateCall = { filter, update, options };
    return { matchedCount: 1 };
  });
  mock.method(Card, "countDocuments", (filter, options) => {
    events.push("Card.countDocuments");
    countCall = { filter, options };
    return {
      session: async (s) => {
        events.push("Card.countDocuments.session");
        countCall.chainedSession = s;
        return 19;
      },
    };
  });
  mock.method(Card.prototype, "save", async function (options) {
    events.push("Card.save");
    saveOptions = options;
    return this;
  });

  const res = responseStub();
  await CardController.create(
    {
      user: { _id: ids.user, isAdmin: false },
      body: { cardName: "Thiệp thứ 20", blank: true },
    },
    res
  );

  assert.equal(res.code, 201);
  assert.equal(res.body.card.cardName, "Thiệp thứ 20");
  assert.equal(String(res.body.card.owner), ids.user);
  assert.deepEqual(events, [
    "startSession",
    "User.updateOne",
    "Card.countDocuments",
    "Card.countDocuments.session",
    "Card.save",
  ]);
  assert.deepEqual(updateCall.filter, {
    _id: ids.user,
    isAdmin: { $ne: true },
    isActive: { $ne: false },
  });
  assert.deepEqual(updateCall.update, { $inc: { __v: 1 } });
  assert.equal(updateCall.options.session, session);
  assert.equal(updateCall.options.timestamps, false);
  assert.deepEqual(countCall.filter, { owner: ids.user });
  assert.equal(countCall.chainedSession, session);
  assert.equal(saveOptions.session, session);
  assert.equal(session.ended, 1);
});

test("at 20 cards returns 409 CARD_LIMIT_REACHED without running callback, save, or Cloudinary upload, and ends session", async () => {
  const session = createMockSession();
  let callbackCalls = 0;
  let uploadCalls = 0;

  mock.method(mongoose, "startSession", async () => session);
  mock.method(User, "updateOne", async () => ({ matchedCount: 1 }));
  mock.method(Card, "countDocuments", () => ({
    session: async () => MAX_USER_CARDS,
  }));
  mock.method(Card.prototype, "save", async () => {
    throw new Error("Unexpected save when over quota");
  });
  mock.method(cloudinary.uploader, "upload", async () => {
    uploadCalls += 1;
    throw new Error("Unexpected Cloudinary upload when over quota");
  });
  mock.method(cloudinary.uploader, "upload_stream", () => {
    uploadCalls += 1;
    throw new Error("Unexpected Cloudinary stream when over quota");
  });

  await assert.rejects(
    () =>
      createCardWithinQuota({ _id: ids.user, isAdmin: false }, async () => {
        callbackCalls += 1;
        return {};
      }),
    (err) =>
      err instanceof CardCreationError &&
      err.status === 409 &&
      err.code === "CARD_LIMIT_REACHED"
  );
  assert.equal(callbackCalls, 0);
  assert.equal(session.ended, 1);

  const res = responseStub();
  await CardController.create(
    {
      user: { _id: ids.user, isAdmin: false },
      body: {
        cardName: "Quá giới hạn",
        blank: true,
        design: domDesign(),
        preview,
      },
    },
    res
  );

  assert.equal(res.code, 409);
  assert.equal(res.body.code, "CARD_LIMIT_REACHED");
  assert.match(res.body.message, /20/);
  assert.equal(uploadCalls, 0);
  assert.equal(session.ended, 2);
});

test("admin bypasses session, user serialization, and 20-card quota", async () => {
  const startSessionMock = mock.method(mongoose, "startSession", async () => {
    throw new Error("Admin should not start a quota session");
  });
  const updateOneMock = mock.method(User, "updateOne", async () => {
    throw new Error("Admin should not serialize on User");
  });
  const countMock = mock.method(Card, "countDocuments", () => {
    throw new Error("Admin should not count cards");
  });
  let receivedSession = "unset";
  const result = await createCardWithinQuota(
    { _id: ids.admin, isAdmin: true },
    async (session) => {
      receivedSession = session;
      return { ok: true };
    }
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(receivedSession, null);

  let saveOpts;
  mock.method(Card.prototype, "save", async function (opts) {
    saveOpts = opts;
    return this;
  });
  const res = responseStub();
  await CardController.create(
    {
      user: { _id: ids.admin, isAdmin: true },
      body: { cardName: "Admin card" },
    },
    res
  );

  assert.equal(res.code, 201);
  assert.equal(saveOpts, undefined);
  assert.equal(startSessionMock.mock.callCount(), 0);
  assert.equal(updateOneMock.mock.callCount(), 0);
  assert.equal(countMock.mock.callCount(), 0);
});

test("unavailable or converted account rejects with 403 before counting and ends session", async () => {
  const session = createMockSession();
  mock.method(mongoose, "startSession", async () => session);
  mock.method(User, "updateOne", async () => ({ matchedCount: 0 }));
  const countMock = mock.method(Card, "countDocuments", () => {
    throw new Error("Count must not run when User lock misses");
  });

  const res = responseStub();
  await CardController.create(
    {
      user: { _id: ids.user, isAdmin: false },
      body: { cardName: "Blocked", blank: true },
    },
    res
  );

  assert.equal(res.code, 403);
  assert.equal(res.body.code, "ACCOUNT_UNAVAILABLE");
  assert.equal(countMock.mock.callCount(), 0);
  assert.equal(session.ended, 1);
});

test("DB/transaction failure ends session and never falls back to saving outside transaction", async () => {
  const session = createMockSession({
    transactionError: new Error("Replica set transaction unavailable"),
  });
  mock.method(mongoose, "startSession", async () => session);
  const saveMock = mock.method(Card.prototype, "save", async () => {
    throw new Error("Must never fall back without transaction");
  });

  const res = responseStub();
  await CardController.create(
    {
      user: { _id: ids.user, isAdmin: false },
      body: { cardName: "Fail tx", blank: true },
    },
    res
  );

  assert.equal(res.code, 500);
  assert.equal(res.body.message, "Không thể tạo thiệp.");
  assert.equal(saveMock.mock.callCount(), 0);
  assert.equal(session.ended, 1);
});

test("transaction write-conflict retry reuses cached DOM design promise so Cloudinary uploads run only once", async () => {
  const session = createMockSession({ retries: 1 });
  let uploadCalls = 0;
  let rawJsonCalls = 0;
  let updateCount = 0;
  let countCalls = 0;
  let saveAttempts = 0;

  mock.method(mongoose, "startSession", async () => session);
  mock.method(User, "updateOne", async () => {
    updateCount += 1;
    return { matchedCount: 1 };
  });
  mock.method(Card, "countDocuments", () => ({
    session: async () => {
      countCalls += 1;
      return 5;
    },
  }));
  mock.method(cloudinary.uploader, "upload", async () => {
    uploadCalls += 1;
    return { secure_url: `https://cdn.example/img-${uploadCalls}.png` };
  });
  mock.method(cloudinary.uploader, "upload_stream", (_opts, cb) => ({
    end() {
      rawJsonCalls += 1;
      cb(null, { secure_url: `https://cdn.example/design-${rawJsonCalls}.json` });
    },
  }));
  mock.method(Card.prototype, "save", async function () {
    saveAttempts += 1;
    if (saveAttempts === 1) {
      throw Object.assign(new Error("WriteConflict"), { retryable: true });
    }
    return this;
  });

  const res = responseStub();
  await CardController.create(
    {
      user: { _id: ids.user, isAdmin: false },
      body: {
        cardName: "Retry card",
        blank: true,
        design: domDesign(),
        preview,
      },
    },
    res
  );

  assert.equal(res.code, 201);
  assert.equal(updateCount, 2);
  assert.equal(countCalls, 2);
  assert.equal(saveAttempts, 2);
  // 1 embedded image + 1 preview image + 1 raw design JSON, even across 2 transaction attempts
  assert.equal(uploadCalls, 2);
  assert.equal(rawJsonCalls, 1);
  assert.equal(res.body.card.designUrl, "https://cdn.example/design-1.json");
  assert.equal(session.ended, 1);
});
