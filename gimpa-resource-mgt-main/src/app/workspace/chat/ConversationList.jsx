"use client";

// Stage 5 — left rail: channels + DMs with unread dots and a New-DM button.
//
// Unread is a boolean dot (not an exact count) for MVP: a conversation is
// unread when its lastMessageAt is newer than the viewer's lastRead for
// that conversation AND the last message wasn't sent by the viewer. The
// exact unread COUNT (per the proposal mock) is Future Work — it would
// need a message query per conversation.

function tsMillis(t) {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return 0;
}

function isUnread(convo, currentUser, lastRead) {
  if (!convo.lastMessageAt) return false;
  if (convo.lastMessageSenderId === currentUser?.uid) return false;
  return tsMillis(convo.lastMessageAt) > tsMillis(lastRead?.[convo.id]);
}

function dmName(convo, currentUser) {
  const otherUid = (convo.participantIds || []).find((u) => u !== currentUser?.uid);
  return (convo.participantNames && convo.participantNames[otherUid]) || "Direct message";
}

export default function ConversationList({
  channels,
  dms,
  currentUser,
  selectedId,
  lastRead,
  loading,
  onSelect,
  onNewDm
}) {
  const renderItem = (convo, label, prefix) => {
    const unread = isUnread(convo, currentUser, lastRead);
    return (
      <div
        key={convo.id}
        className={`chat-convo-item ${selectedId === convo.id ? "active" : ""}`}
        onClick={() => onSelect(convo.id)}
      >
        <span className="chat-convo-name">
          <span className="chat-convo-prefix">{prefix}</span>
          {label}
        </span>
        {unread && <span className="chat-unread-dot" aria-label="unread" />}
      </div>
    );
  };

  return (
    <div className="chat-convo-list">
      <div className="chat-convo-group">
        <div className="chat-convo-group-title">Channels</div>
        {loading && !channels.length ? (
          <div className="chat-convo-empty">Loading…</div>
        ) : (
          channels
            .slice()
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
            .map((c) => renderItem(c, c.name || c.channelKey, "#"))
        )}
      </div>

      <div className="chat-convo-group">
        <div className="chat-convo-group-title">Direct Messages</div>
        <button type="button" className="chat-new-dm-btn" onClick={onNewDm}>
          + New DM
        </button>
        {dms.length === 0 ? (
          <div className="chat-convo-empty">No direct messages yet.</div>
        ) : (
          dms
            .slice()
            .sort((a, b) => tsMillis(b.lastMessageAt) - tsMillis(a.lastMessageAt))
            .map((d) => renderItem(d, dmName(d, currentUser), "@"))
        )}
      </div>
    </div>
  );
}
