// In-memory query double. No database connection; honors list projection and bounds.
export function listQuery(documents, filter = {}, projection = {}) {
  let rows = documents.filter((doc) => Object.entries(filter).every(([key, value]) =>
    key === "_id" && value?.$lt ? String(doc._id) < value.$lt : String(doc[key]) === String(value)
  ));
  const query = {
    sort() { rows = [...rows].sort((a, b) => String(b._id).localeCompare(String(a._id))); return query; },
    limit(value) { rows = rows.slice(0, value); return query; },
    populate() { return query; },
    lean: async () => rows.map((doc) => Object.fromEntries([
      ["_id", doc._id],
      ...Object.entries(projection).filter(([key]) => doc[key] !== undefined).map(([key, spec]) =>
        [key, spec?.$slice ? doc[key].slice(0, spec.$slice) : doc[key]]),
    ])),
  };
  return query;
}
