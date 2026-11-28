import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, beforeEach, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.js";
import User from "../models/User.js";
import { createApp } from "../app.js";
import { uploadImage, uploadRawJson } from "../services/cloudinaryService.js";

mongoose.set("bufferCommands", false);

const oldSecret = process.env.JWT_SECRET;
const SECRET = "test-only-upload-secret-not-real";
const USER_ID = "111111111111111111111111";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let server;
let baseUrl;
let authToken;

function query(value) {
  return {
    select: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
}

async function api(path, { method = "POST", body, auth, base = baseUrl } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

before(async () => {
  process.env.JWT_SECRET = SECRET;
  authToken = jwt.sign({ id: USER_ID }, SECRET, { expiresIn: "1h" });
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
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
  mock.method(mongoose, "connect", () => {
    throw new Error("Tests must not connect to a database");
  });
  mock.method(User, "findById", (id) =>
    query(String(id) === USER_ID ? { _id: USER_ID, username: "uploader", isAdmin: false, isActive: true } : null)
  );
});

test("unauthenticated upload-base64 request is rejected with 401 before touching Cloudinary", async () => {
  const uploadMock = mock.method(cloudinary.uploader, "upload", async () => {
    throw new Error("Unexpected cloud upload");
  });

  const res = await api("/api/upload-base64", {
    body: { base64: "data:image/png;base64,aGVsbG8=" },
  });

  assert.equal(res.status, 401);
  assert.equal(uploadMock.mock.callCount(), 0);
});

test("valid PNG/JPEG/JPG/WebP/GIF base64 payloads upload with expected options and return { url }", async () => {
  const calls = [];
  mock.method(cloudinary.uploader, "upload", async (source, options) => {
    calls.push({ source, options });
    return { secure_url: `https://cdn.example/img-${calls.length}.png` };
  });

  const formats = ["png", "jpeg", "jpg", "webp", "gif"];
  for (const [index, ext] of formats.entries()) {
    const payload = `data:image/${ext};base64,aGVsbG8=`;
    const res = await api("/api/upload-base64", {
      auth: authToken,
      body: { base64: payload },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { url: `https://cdn.example/img-${index + 1}.png` });
    assert.equal(calls[index].source, payload);
    assert.deepEqual(calls[index].options, {
      folder: "birthday_assets",
      resource_type: "image",
    });
  }
});

test("invalid input and >5MiB payloads reject with 400/413 before contacting Cloudinary", async () => {
  const uploadMock = mock.method(cloudinary.uploader, "upload", async () => {
    throw new Error("Unexpected cloud upload");
  });

  for (const bad of [
    undefined,
    123,
    "https://example.com/a.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,not*valid",
  ]) {
    const res = await api("/api/upload-base64", {
      auth: authToken,
      body: { base64: bad },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Chỉ chấp nhận ảnh PNG, JPEG, WebP hoặc GIF dạng base64.");
  }

  const oversized = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString("base64")}`;
  const largeRes = await api("/api/upload-base64", {
    auth: authToken,
    body: { base64: oversized },
  });
  assert.equal(largeRes.status, 413);
  assert.equal(largeRes.body.message, "Ảnh không được vượt quá 5 MiB.");
  assert.equal(uploadMock.mock.callCount(), 0);
});

test("provider rejection returns 500 with existing error contract", async () => {
  mock.method(console, "error", () => {});
  mock.method(cloudinary.uploader, "upload", async () => {
    throw new Error("Cloudinary unavailable");
  });

  const res = await api("/api/upload-base64", {
    auth: authToken,
    body: { base64: "data:image/png;base64,aGVsbG8=" },
  });

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { message: "Upload thất bại" });
});

test("removed /api/upload-image and /api/upload-json routes remain 404", async () => {
  for (const path of ["/api/upload-image", "/api/upload-json"]) {
    const res = await api(path, { auth: authToken, body: {} });
    assert.equal(res.status, 404);
  }
});

test("cloudinaryService.uploadRawJson and uploadImage preserve options, unique IDs, and stream error handling", async () => {
  const streamCalls = [];
  mock.method(cloudinary.uploader, "upload_stream", (options, callback) => ({
    end(buffer) {
      streamCalls.push({ options, buffer: Buffer.from(buffer) });
      callback(null, { secure_url: `https://cdn.example/raw-${streamCalls.length}.json` });
    },
  }));

  const vnJson = '{"title":"Chúc mừng sinh nhật"}';
  const vnBuffer = Buffer.from('{"note":"Quà tặng đặc biệt"}', "utf-8");
  const url1 = await uploadRawJson(vnJson, "birthday_designs");
  const url2 = await uploadRawJson(vnBuffer, "birthday_designs");

  assert.equal(url1, "https://cdn.example/raw-1.json");
  assert.equal(url2, "https://cdn.example/raw-2.json");
  assert.deepEqual(streamCalls[0].buffer, Buffer.from(vnJson, "utf-8"));
  assert.equal(streamCalls[0].buffer.toString("utf-8"), vnJson);
  assert.deepEqual(streamCalls[1].buffer, vnBuffer);
  assert.equal(streamCalls[0].options.resource_type, "raw");
  assert.equal(streamCalls[0].options.folder, "birthday_designs");
  assert.equal(streamCalls[0].options.overwrite, false);
  assert.match(streamCalls[0].options.public_id, UUID_RE);
  assert.equal(streamCalls[1].options.folder, "birthday_designs");
  assert.equal(streamCalls[1].options.overwrite, false);
  assert.match(streamCalls[1].options.public_id, UUID_RE);
  assert.notEqual(streamCalls[0].options.public_id, streamCalls[1].options.public_id);

  mock.method(console, "error", () => {});
  mock.method(cloudinary.uploader, "upload_stream", (_options, callback) => ({
    end() {
      callback(new Error("Stream failed"));
    },
  }));
  await assert.rejects(() => uploadRawJson("{}", "birthday_designs"), /Stream failed/);

  const imageCalls = [];
  mock.method(cloudinary.uploader, "upload", async (source, options) => {
    imageCalls.push({ source, options });
    return { secure_url: "https://cdn.example/dom-img.png" };
  });
  const imgUrl = await uploadImage("data:image/png;base64,aGVsbG8=", { folder: "birthday_assets" });
  assert.equal(imgUrl, "https://cdn.example/dom-img.png");
  assert.deepEqual(imageCalls[0].options, { folder: "birthday_assets" });
});

test("upload-base64 enforces 30/min rate limit after authentication", async () => {
  const uploadMock = mock.method(cloudinary.uploader, "upload", async () => ({
    secure_url: "https://cdn.example/rate-ok.png",
  }));

  const { default: isolatedUploadRoutes } = await import("../routes/uploadRoutes.js?isolated-rate-test");
  const isolatedApp = express();
  isolatedApp.use(express.json());
  isolatedApp.use("/api/upload-base64", isolatedUploadRoutes);

  const isolatedServer = isolatedApp.listen(0, "127.0.0.1");
  await once(isolatedServer, "listening");
  const isolatedBaseUrl = `http://127.0.0.1:${isolatedServer.address().port}`;

  try {
    for (let i = 0; i < 30; i += 1) {
      const okRes = await api("/api/upload-base64", {
        auth: authToken,
        body: { base64: "data:image/png;base64,aGVsbG8=" },
        base: isolatedBaseUrl,
      });
      assert.equal(okRes.status, 200);
    }
    assert.equal(uploadMock.mock.callCount(), 30);

    const limited = await api("/api/upload-base64", {
      auth: authToken,
      body: { base64: "data:image/png;base64,aGVsbG8=" },
      base: isolatedBaseUrl,
    });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(uploadMock.mock.callCount(), 30);

    const unauthed = await api("/api/upload-base64", {
      body: { base64: "data:image/png;base64,aGVsbG8=" },
      base: isolatedBaseUrl,
    });
    assert.equal(unauthed.status, 401);
    assert.equal(uploadMock.mock.callCount(), 30);
  } finally {
    await new Promise((resolve) => isolatedServer.close(resolve));
  }
});
