import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import mongoose from "mongoose";
import { normalizeDomDesign } from "../../shared/designSchema.js";
import cloudinary from "../config/cloudinary.js";
import Card from "../models/Card.js";
import Template from "../models/Template.js";
import User from "../models/User.js";
import CardController from "../controllers/CardController.js";
import TemplateController from "../controllers/TemplateController.js";
import CardShareController from "../controllers/CardShareController.js";
import { parseDomDesign, validateDesignRequest, saveDomDesign } from "../utils/designDocument.js";

const preview = "data:image/png;base64,aGVsbG8=";
const design = () => normalizeDomDesign({ schemaVersion: 1, width: 1080, height: 1440, background: "#fff", elements: [
  { id: "greeting", type: "text", text: "Chúc mừng sinh nhật!", x: 100, y: 100, width: 850, height: 150, fontSize: 64 },
] });
const user = { _id: "111111111111111111111111", isAdmin: false };
const id = "222222222222222222222222";
function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
let uploadCalls, jsonWrites;
beforeEach(() => {
  uploadCalls = [];
  jsonWrites = [];
  mock.method(mongoose, "connect", () => { throw new Error("No database connections in tests"); });
  mock.method(mongoose, "startSession", async () => ({
    withTransaction: async (fn) => fn(),
    endSession: async () => {},
  }));
  mock.method(User, "updateOne", async () => ({ matchedCount: 1 }));
  mock.method(Card, "countDocuments", async () => 0);
  mock.method(cloudinary.uploader, "upload", async (value, options) => {
    uploadCalls.push({ value, options });
    return { secure_url: `https://cdn.example/image-${uploadCalls.length}.png` };
  });
  mock.method(cloudinary.uploader, "upload_stream", (options, callback) => ({
    end(buffer) { jsonWrites.push({ options, design: JSON.parse(buffer.toString()) }); callback(null, { secure_url: "https://cdn.example/design.json" }); },
  }));
});
afterEach(() => mock.restoreAll());

test("DOM JSON round-trips Vietnamese text and fixed dimensions", () => {
  const parsed = parseDomDesign(JSON.stringify(design()));
  assert.equal(parsed.width, 1080);
  assert.equal(parsed.height, 1440);
  assert.equal(parsed.elements[0].text, "Chúc mừng sinh nhật!");
  assert.equal(Card.schema.path("designFormat").enumValues[0], "dom");
  assert.ok(Template.schema.path("previewUrl"));
});

test("malformed, oversized, duplicate-ID and unsafe designs reject before cloud writes", () => {
  const duplicate = design(); duplicate.elements.push({ ...duplicate.elements[0] });
  const large = design(); large.width = 99999;
  const unsafe = design(); unsafe.elements.push({ id: "bad", type: "image", src: "http://127.0.0.1/private" });
  const many = design(); many.elements = Array.from({ length: 201 }, (_, i) => ({ ...many.elements[0], id: String(i) }));
  for (const value of [null, "{", { objects: [] }, { pages: [] }, { schemaVersion: 9, elements: [] }, duplicate, large, unsafe, many]) {
    assert.throws(() => parseDomDesign(value));
  }
  for (const body of [
    { design: design() }, { design: design(), preview: "https://private.example" },
    { design: design(), preview, fabricEdit: { objects: [] } },
    { fabricEdit: { objects: [] } },
    { fabricEdit: "{}" },
    { designUrl: "https://private.example/design.json" }, { previewUrl: "https://private.example/p.png" },
    { preview },
  ]) assert.throws(() => validateDesignRequest(body));
  assert.equal(uploadCalls.length + jsonWrites.length, 0);
});

test("embedded image assets upload once and native JSON and thumbnail use independent resources", async () => {
  const d = design();
  d.elements.push({ id: "photo", type: "image", src: preview });
  d.elements.push({ id: "photo-copy", type: "image", src: preview });
  const saved = await saveDomDesign(parseDomDesign(d), preview);
  assert.equal(saved.designFormat, "dom");
  assert.equal(saved.previewUrl, "https://cdn.example/image-2.png");
  assert.deepEqual(saved.imgURL, ["https://cdn.example/image-1.png"]);
  assert.equal(uploadCalls.length, 2);
  assert.equal(jsonWrites[0].design.elements[1].src, saved.imgURL[0]);
  assert.equal(jsonWrites[0].options.overwrite, false);
  assert.equal(jsonWrites[0].options.folder, "birthday_designs");
});

test("owner saves DOM fields and thumbnail while preserving card metadata and rejecting legacy fabricEdit", async () => {
  const existing = { _id: id, owner: user._id, cardDESC: "Lời chúc cũ", isEditable: true };
  mock.method(Card, "findOne", async () => existing);
  let stored;
  mock.method(Card, "findOneAndUpdate", async (_filter, fields) => { stored = { ...existing, ...fields }; return stored; });
  const res = response();
  await CardController.update({ params: { id }, user, body: { cardName: "Thiệp mới", design: design(), preview } }, res);
  assert.equal(res.code, 200);
  assert.equal(stored.designFormat, "dom");
  assert.equal(stored.designUrl, "https://cdn.example/design.json");
  assert.equal(stored.cardDESC, "Lời chúc cũ");
  assert.equal(stored.previewUrl, "https://cdn.example/image-1.png");

  const rejected = response();
  await CardController.update({ params: { id }, user, body: { fabricEdit: { objects: [] } } }, rejected);
  assert.equal(rejected.code, 400);
});

test("unauthorized save and malformed payload never upload or update records", async () => {
  let record = null;
  mock.method(Card, "findOne", async () => record);
  const update = mock.method(Card, "findOneAndUpdate", async () => { throw new Error("Unexpected database write"); });
  const req = { params: { id }, user, body: { cardName: "Test", design: design(), preview } };
  const denied = response(); await CardController.update(req, denied);
  assert.equal(denied.code, 404);
  record = { _id: id, owner: user._id };
  const bad = response(); await CardController.update({ ...req, body: { design: { pages: [] }, preview } }, bad);
  assert.equal(bad.code, 400);
  assert.equal(uploadCalls.length + jsonWrites.length, 0);
  assert.equal(update.mock.callCount(), 0);
});

test("cloud failure leaves the previous record and its preview untouched", async () => {
  mock.method(Card, "findOne", async () => ({ _id: id, owner: user._id, designUrl: "old.json", previewUrl: "old.png" }));
  const update = mock.method(Card, "findOneAndUpdate", async () => { throw new Error("Unexpected update"); });
  mock.method(cloudinary.uploader, "upload_stream", () => { throw new Error("Cloud failed"); });
  const res = response();
  await CardController.update({ params: { id }, user, body: { design: design(), preview } }, res);
  assert.equal(res.code, 500);
  assert.equal(update.mock.callCount(), 0);
});

test("creating from DOM template copies its references without uploading or modifying the template", async () => {
  const template = { _id: id, designUrl: "https://cdn.example/template.json", designFormat: "dom", previewUrl: "https://cdn.example/template.png", imgURL: ["https://cdn.example/photo.png"] };
  mock.method(Template, "findById", async () => template);
  mock.method(Card.prototype, "save", async function () { return this; });
  const res = response();
  await CardController.create({ user, body: { templateId: id, cardName: "Của tôi" } }, res);
  assert.equal(res.code, 201);
  assert.equal(res.body.card.designUrl, template.designUrl);
  assert.equal(res.body.card.previewUrl, template.previewUrl);
  assert.equal(uploadCalls.length + jsonWrites.length, 0);
});

test("a regular user can start an owned blank card without templates or cloud writes", async () => {
  mock.method(Card.prototype, "save", async function () { return this; });
  const res = response();
  await CardController.create({ user, body: { blank: true, cardName: "Thiệp của tôi" } }, res);
  assert.equal(res.code, 201);
  assert.equal(String(res.body.card.owner), user._id);
  assert.equal(res.body.card.designUrl, undefined);
  assert.equal(uploadCalls.length + jsonWrites.length, 0);
});

test("style injection, unsupported elements, invalid numbers and bad version are rejected", () => {
  for (const patch of [
    { fontFamily: "url(https://example.test/font)" }, { fontSize: Infinity },
    { color: "url(https://example.test/color)" }, { opacity: -1 },
    { width: 0 }, { type: "html", html: "<script>alert(1)</script>" },
  ]) {
    const d = design(); Object.assign(d.elements[0], patch);
    assert.throws(() => parseDomDesign(d));
  }
  assert.equal(parseDomDesign({ schemaVersion: 1, width: 1080, height: 1440, elements: [] }).elements.length, 0);
});

test("admin creates and updates DOM templates with validated payloads; metadata updates keep design", async () => {
  const saveMock = mock.method(Template.prototype, "save", async function () { return this; });
  mock.method(Template, "exists", async () => ({ _id: id }));
  mock.method(Template, "findByIdAndUpdate", async (_id, fields) => fields);
  const req = { params: { id }, user: { ...user, isAdmin: true }, body: { name: "Mẫu mới", design: design(), preview } };
  const created = response(); await TemplateController.create(req, created);
  assert.equal(created.code, 201);
  assert.equal(created.body.template.designFormat, "dom");
  const updated = response(); await TemplateController.update(req, updated);
  assert.equal(updated.code, 200);
  assert.equal(updated.body.template.designUrl, "https://cdn.example/design.json");

  const uploadsBefore = uploadCalls.length + jsonWrites.length;
  const metaUpdated = response();
  await TemplateController.update({ params: { id }, user: { ...user, isAdmin: true }, body: { name: "Mẫu đổi tên" } }, metaUpdated);
  assert.equal(metaUpdated.code, 200);
  assert.deepEqual(metaUpdated.body.template, { name: "Mẫu đổi tên" });
  assert.equal(uploadCalls.length + jsonWrites.length, uploadsBefore);

  const missingDesign = response();
  await TemplateController.create({ user: { ...user, isAdmin: true }, body: { name: "Thiếu design" } }, missingDesign);
  assert.equal(missingDesign.code, 400);
  assert.equal(saveMock.mock.callCount(), 1);
  assert.equal(uploadCalls.length + jsonWrites.length, uploadsBefore);

  const legacyTpl = response();
  await TemplateController.create({ user: { ...user, isAdmin: true }, body: { name: "Legacy", fabricEdit: { objects: [] } } }, legacyTpl);
  assert.equal(legacyTpl.code, 400);
  assert.equal(saveMock.mock.callCount(), 1);
  assert.equal(uploadCalls.length + jsonWrites.length, uploadsBefore);
});

test("public share includes DOM content but omits owner, share hash and assets", async () => {
  const record = { cardName: "Sinh nhật", designUrl: "https://cdn.example/d.json", designFormat: "dom", previewUrl: "https://cdn.example/p.png", owner: user._id, imgURL: ["private"], shareTokenHash: "private" };
  mock.method(Card, "findOne", () => ({ select: async () => record }));
  const res = response(); await CardShareController.getSharedCard({ params: { token: "a".repeat(43) } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { cardName: record.cardName, designUrl: record.designUrl, designFormat: "dom", previewUrl: record.previewUrl });
});
