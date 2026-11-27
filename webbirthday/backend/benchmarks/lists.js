// Local HTTP comparison only: fake database, synthetic data, no cloud writes.
import { mock } from "node:test";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Card from "../models/Card.js";
import Template from "../models/Template.js";
import User from "../models/User.js";
import { listQuery } from "../tests/helpers/listQuery.js";

process.env.DOTENV_CONFIG_QUIET = "true";
process.env.JWT_SECRET = "synthetic-benchmark-only";
const { createApp } = await import("../app.js");
const { authenticate } = await import("../middlewares/auth.js");
const owner = "222222222222222222222222";
const cards = Array.from({ length: 1000 }, (_, i) => ({
  _id: (i + 1).toString(16).padStart(24, "0"), cardName: `Card ${i}`,
  imgURL: Array.from({ length: 20 }, (_, j) => `https://res.cloudinary.com/example/image/upload/v1/card-${i}/image-${j}.jpg`),
  cardDESC: "Description ".repeat(50), owner: { _id: owner, username: "alice" },
  createdAt: "2026-11-27T00:00:00.000Z", isEditable: true,
  fabricEdit: `https://res.cloudinary.com/example/raw/upload/v1/card-${i}.json`,
}));
const templates = cards.map((card) => ({ _id: card._id, name: card.cardName, owner: card.owner, createdAt: card.createdAt, imgURL: card.imgURL, fabricEdit: card.fabricEdit }));
mock.method(mongoose, "connect", () => { throw new Error("Benchmark must not connect to a database"); });
mock.method(User, "findById", () => ({ select: async () => ({ _id: owner, username: "alice", isAdmin: false, isActive: true }) }));
const owned = cards.map((card) => ({ ...card, owner }));
mock.method(Card, "find", (filter, projection) => listQuery(owned, filter, projection));
mock.method(Template, "find", (filter, projection) => listQuery(templates, filter, projection));
const app = express();
app.get("/baseline/cards", authenticate, (req, res) => res.json(cards));
app.get("/baseline/templates", authenticate, (req, res) => res.json(templates));
app.use(createApp());
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const root = `http://127.0.0.1:${server.address().port}`;
const headers = { Authorization: `Bearer ${jwt.sign({ id: owner }, process.env.JWT_SECRET)}` };

async function measure(path) {
  async function call() {
    const start = performance.now();
    const res = await fetch(root + path, { headers });
    if (!res.ok) throw new Error(`Unexpected status ${res.status}`);
    const body = await res.arrayBuffer();
    return { ms: performance.now() - start, bytes: body.byteLength };
  }
  for (let i = 0; i < 5; i++) await call();
  const samples = [];
  const start = performance.now();
  await Promise.all(Array.from({ length: 10 }, async () => {
    for (let i = 0; i < 10; i++) samples.push(await call());
  }));
  const elapsed = performance.now() - start;
  const times = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  return { requests: samples.length, concurrency: 10, bytesPerResponse: samples[0].bytes, p50Ms: +times[49].toFixed(2), p95Ms: +times[94].toFixed(2), requestsPerSecond: +(samples.length * 1000 / elapsed).toFixed(2) };
}

try {
  const report = {
    measuredAt: new Date().toISOString(), runtime: process.version,
    scope: "Loopback HTTP, mocked MongoDB, no database/network/cloud load; includes JWT, serialization and body transfer; excludes browser render, Atlas, indexes, CDN and real canvas load.",
    fixture: { cardsOfOneOwner: 1000, templates: 1000, imageUrlsPerItem: 20, cardDescriptionChars: 600, pageSize: 24 },
    cards: { before: await measure("/baseline/cards"), after: await measure("/api/cards") },
    templates: { before: await measure("/baseline/templates"), after: await measure("/api/templates") },
  };
  const json = JSON.stringify(report, null, 2) + "\n";
  if (process.argv[2]) await writeFile(process.argv[2], json);
  console.log(json);
} finally {
  await new Promise((resolve) => server.close(resolve));
  mock.restoreAll();
}
