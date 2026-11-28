import Card from "../models/Card.js";

// Count cards per owner without collecting card content or file URLs.
export async function cardStats(owners) {
  if (!Array.isArray(owners) || owners.length === 0) return new Map();
  const rows = await Card.aggregate([
    { $match: { owner: { $in: owners } } },
    { $group: {
      _id: "$owner",
      count: { $sum: 1 },
    } },
  ]);
  return new Map(rows.map((row) => [String(row._id), { cardCount: row.count }]));
}
