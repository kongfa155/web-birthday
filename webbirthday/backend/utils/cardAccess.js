// Legacy unassigned cards can still be maintained by admins. Assigned cards are private.
export function readableCards(user) {
  return user.isAdmin
    ? { $or: [{ owner: user._id }, { owner: null }] }
    : { owner: user._id, isEditable: false };
}
export function editableCards(user) {
  return { $or: [{ owner: user._id }, { owner: null }] };
}
