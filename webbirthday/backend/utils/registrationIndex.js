import User from "../models/User.js";

// Read-only precondition: never create indexes or migrate existing data at runtime.
export async function hasUniqueUsernameIndex() {
  const indexes = await User.collection.listIndexes().toArray();
  return indexes.some((index) => index.unique === true
    && Object.keys(index.key).length === 1
    && Math.abs(index.key.username) === 1
    && !index.partialFilterExpression
    && (!index.collation || index.collation.locale === "simple"));
}

export async function hasUniqueGoogleIndex() {
  const indexes = await User.collection.listIndexes().toArray();
  return indexes.some((index) => index.unique === true
    && Object.keys(index.key).length === 1
    && Math.abs(index.key.googleSub) === 1
    && index.partialFilterExpression?.googleSub?.$type === "string"
    && Object.keys(index.partialFilterExpression).length === 1
    && (!index.collation || index.collation.locale === "simple"));
}
