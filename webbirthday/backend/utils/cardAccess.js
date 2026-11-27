// Every card is private to its owner, including drafts and legacy records.
export function readableCards(user) {
  return { owner: user._id };
}
export function editableCards(user) {
  return { owner: user._id };
}
