const { randomBytes } = require("node:crypto");
const { TtlCache } = require("../../utils/ttlCache");

/**
 * A task drafted from a Discord message ("Create task" on a message). Short, one-line messages become
 * the title; anything longer goes in the description, with the title left for the person to write.
 * Either way the description links back to the message.
 */

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;

/** Drafts waiting for a board to be picked; a form can only be opened from the click itself. */
const drafts = new TtlCache(15 * 60_000, 500);

/** Mentions, channels and custom emoji as people read them, rather than Discord's codes. */
function readable(message) {
    const users = message.mentions?.users;
    const members = message.mentions?.members;
    const roles = message.mentions?.roles;
    const channels = message.mentions?.channels;
    return String(message.content ?? "")
        .replace(/<@!?(\d+)>/g, (code, id) => {
            const name = members?.get(id)?.displayName ?? users?.get(id)?.globalName ?? users?.get(id)?.username;
            return name ? `@${name}` : code;
        })
        .replace(/<@&(\d+)>/g, (code, id) => (roles?.get(id) ? `@${roles.get(id).name}` : code))
        .replace(/<#(\d+)>/g, (code, id) => (channels?.get(id)?.name ? `#${channels.get(id).name}` : code))
        .replace(/<a?:(\w+):\d+>/g, ":$1:")
        .trim();
}

function authorName(message) {
    return message.member?.displayName ?? message.author?.globalName ?? message.author?.username ?? "someone";
}

/**
 * @param {import("discord.js").Message} message
 * @returns {{ title: string, description: string }}
 */
function draftFromMessage(message) {
    const text = readable(message);
    const where = message.channel?.name ? ` in #${message.channel.name}` : "";
    const attachments = message.attachments?.size ?? 0;
    const source = [
        `From [${authorName(message)}'s message](${message.url})${where}.`,
        attachments > 0 ? `It had ${attachments} attachment${attachments === 1 ? "" : "s"}; see the original message.` : null,
    ].filter(Boolean).join(" ");

    if (text && !text.includes("\n") && text.length <= TITLE_MAX) {
        return { title: text, description: source };
    }
    if (!text) {
        return { title: "", description: source };
    }
    const room = DESCRIPTION_MAX - source.length - 2;
    const cutNote = "\n\n*(Cut off here; the whole message is linked below.)*";
    const body = text.length <= room ? text : `${text.slice(0, room - cutNote.length).trimEnd()}${cutNote}`;
    return { title: "", description: `${body}\n\n${source}` };
}

/** Keeps a draft while a board is picked; returns its id, which goes in the buttons. */
function saveDraft(userId, draft) {
    const id = randomBytes(6).toString("hex");
    drafts.set(id, { userId, draft });
    return id;
}

/** The draft, if it is still here and belongs to this person. */
function findDraft(id, userId) {
    const entry = drafts.get(id);
    return entry && entry.userId === userId ? entry.draft : null;
}

module.exports = { draftFromMessage, saveDraft, findDraft };
