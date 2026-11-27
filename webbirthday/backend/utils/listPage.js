import mongoose from "mongoose";

export function parsePage(query) {
  if (Object.keys(query).some((key) => !["limit", "before"].includes(key))) return null;
  const raw = query.limit ?? "24";
  if (typeof raw !== "string" || !/^[1-9]\d{0,2}$/.test(raw) || Number(raw) > 100) return null;
  if (query.before !== undefined && (typeof query.before !== "string" || !mongoose.isObjectIdOrHexString(query.before))) return null;
  return { limit: Number(raw), before: query.before };
}

export async function listPage(model, filter, projection, page, populate) {
  const scoped = page.before ? { ...filter, _id: { $lt: page.before } } : filter;
  let query = model.find(scoped, projection).sort({ _id: -1 }).limit(page.limit + 1);
  if (populate) query = query.populate(populate);
  const rows = await query.lean();
  const items = rows.slice(0, page.limit);
  return { items, nextCursor: rows.length > page.limit ? String(items.at(-1)._id) : null };
}

export const CARD_LIST_FIELDS = { cardName: 1, imgURL: { $slice: 1 }, createdAt: 1, isEditable: 1 };
export const TEMPLATE_LIST_FIELDS = { name: 1, imgURL: { $slice: 1 }, owner: 1, createdAt: 1 };
