import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Card, {
  CARD_SHARE_INDEX_KEY,
  CARD_SHARE_INDEX_OPTIONS,
} from "../models/Card.js";

export function parseShareIndexArgs(argv = []) {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
    } else {
      throw new Error(`Tham số không được hỗ trợ: ${arg}`);
    }
  }
  return { apply };
}

export function matchesApprovedCardShareIndex(index) {
  if (!index || typeof index !== "object") return false;
  const keys = Object.keys(index.key || {});
  const partialKeys = Object.keys(index.partialFilterExpression || {});
  return (
    index.name === CARD_SHARE_INDEX_OPTIONS.name &&
    index.unique === true &&
    keys.length === 1 &&
    index.key?.shareTokenHash === 1 &&
    partialKeys.length === 1 &&
    Object.keys(index.partialFilterExpression?.shareTokenHash || {}).length === 1 &&
    index.partialFilterExpression?.shareTokenHash?.$type === "string" &&
    (!index.collation || index.collation.locale === "simple")
  );
}

export function hasConflictingCardShareIndex(index) {
  if (!index || typeof index !== "object") return false;
  if (matchesApprovedCardShareIndex(index)) return false;
  return (
    index.name === CARD_SHARE_INDEX_OPTIONS.name ||
    Object.prototype.hasOwnProperty.call(index.key || {}, "shareTokenHash")
  );
}

export async function ensureCardShareIndex({
  db,
  collection,
  collectionName = Card.collection.collectionName,
  apply = false,
  logger = console,
}) {
  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    logger.error(
      `Collection "${collectionName}" chưa tồn tại. Từ chối tạo collection ngầm.`
    );
    return { ok: false, status: "missing_collection" };
  }

  const existingIndexes = await collection.listIndexes().toArray();
  if (existingIndexes.some(matchesApprovedCardShareIndex)) {
    logger.log(
      `Index "${CARD_SHARE_INDEX_OPTIONS.name}" trên "${collectionName}" đã tồn tại đúng cấu hình được phê duyệt.`
    );
    return {
      ok: true,
      status: "already_exists",
      indexName: CARD_SHARE_INDEX_OPTIONS.name,
    };
  }

  const conflicts = existingIndexes.filter(hasConflictingCardShareIndex);
  if (conflicts.length > 0) {
    logger.error(
      `Phát hiện index xung đột trên "${collectionName}" (${conflicts
        .map((idx) => idx.name || "unnamed")
        .join(", ")}). Không tự động xóa hoặc ghi đè index.`
    );
    return {
      ok: false,
      status: "conflict",
      conflicts: conflicts.map((idx) => idx.name || "unnamed"),
    };
  }

  if (!apply) {
    logger.log(
      JSON.stringify(
        {
          mode: "dry-run",
          collection: collectionName,
          action: "createIndex",
          key: CARD_SHARE_INDEX_KEY,
          options: CARD_SHARE_INDEX_OPTIONS,
          hint: "Chạy lại với --apply để tạo đúng index đã phê duyệt.",
        },
        null,
        2
      )
    );
    return {
      ok: true,
      status: "dry_run",
      indexName: CARD_SHARE_INDEX_OPTIONS.name,
    };
  }

  await collection.createIndex(CARD_SHARE_INDEX_KEY, CARD_SHARE_INDEX_OPTIONS);
  const updatedIndexes = await collection.listIndexes().toArray();
  if (!updatedIndexes.some(matchesApprovedCardShareIndex)) {
    logger.error(
      `Không xác minh được index "${CARD_SHARE_INDEX_OPTIONS.name}" sau khi tạo.`
    );
    return { ok: false, status: "verification_failed" };
  }

  logger.log(
    `Đã tạo thành công partial unique index "${CARD_SHARE_INDEX_OPTIONS.name}" trên "${collectionName}".`
  );
  return {
    ok: true,
    status: "created",
    indexName: CARD_SHARE_INDEX_OPTIONS.name,
  };
}

async function runCli() {
  let parsed;
  try {
    parsed = parseShareIndexArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  if (!process.env.MONGO_URI) {
    dotenv.config({ path: new URL("../.env", import.meta.url), quiet: true });
  }
  if (!process.env.MONGO_URI) {
    console.error("Thiếu cấu hình MONGO_URI.");
    process.exitCode = 1;
    return;
  }

  let connected = false;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false,
      autoCreate: false,
    });
    connected = true;
    const result = await ensureCardShareIndex({
      db: mongoose.connection.db,
      collection: Card.collection,
      collectionName: Card.collection.collectionName,
      apply: parsed.apply,
      logger: console,
    });
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch {
    console.error(
      "Không thể kết nối MongoDB hoặc xử lý index. Kiểm tra cấu hình và quyền truy cập."
    );
    process.exitCode = 1;
  } finally {
    if (connected) {
      await mongoose.disconnect().catch(() => {});
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runCli();
}
