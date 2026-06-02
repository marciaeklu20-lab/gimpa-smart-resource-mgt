// Single source of truth for "does this booking have unread chat
// messages for this user?" — used by both BookingTable (per-row badge)
// and Sidebar (aggregate count).
//
// A booking is unread for user X iff:
//   - it has at least one message (lastMessageAt is set), AND
//   - the latest message was not authored by X (don't ping yourself), AND
//   - X has either never opened the chat OR last opened it before the
//     latest message landed (lastMessageAt > lastReadByUser[X]).
export const isUnread = (booking, currentUser) => {

  if (!booking?.lastMessageAt) return false;
  if (!currentUser?.uid) return false;
  if (booking.lastMessageAuthorId === currentUser.uid) return false;

  const lastRead = booking.lastReadByUser?.[currentUser.uid];
  if (!lastRead) return true;

  // Both fields are Firestore Timestamps; compare via toMillis(). The
  // optional chaining + fallback handles the brief window after a write
  // where serverTimestamp() is still null client-side.
  const lastMessageMs = booking.lastMessageAt.toMillis?.() ?? 0;
  const lastReadMs = lastRead.toMillis?.() ?? 0;
  return lastMessageMs > lastReadMs;

};
