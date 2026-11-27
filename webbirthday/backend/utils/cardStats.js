import Card from "../models/Card.js";

// Count distinct file references per owner. Never expose file URLs to admins.
export async function cardStats(owners) {
  const rows = await Card.aggregate([
    { $match: { owner: { $in: owners } } },
    { $group: {
      _id: "$owner",
      count: { $sum: 1 },
      files: { $push: { images: "$imgURL", design: "$fabricEdit", nativeDesign: "$designUrl", preview: "$previewUrl" } },
    } },
  ]);
  return new Map(rows.map((row) => {
    const files = new Set();
    for (const item of row.files || []) {
      for (const value of [...(item.images || []), item.design, item.nativeDesign, item.preview]) {
        if (typeof value === "string" && value.trim()) files.add(value);
      }
    }
    return [String(row._id), { cardCount: row.count, fileCount: files.size }];
  }));
}
