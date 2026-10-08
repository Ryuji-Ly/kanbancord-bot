const { appendFooter, appendText, buildContainer, v2Payload } = require("./containers");
const { COLORS } = require("./theme");
const { listOf } = require("../services/permissions/botAccess");
const { plain } = require("../utils/format");

/**
 * Telling a server's managers that something the bot was set up to do stopped working, and why:
 * posted once, in the server's updates or system channel, when it starts.
 */

const boards = (names) => listOf(names.map((name) => `**${plain(name, 60)}**`));

/** Why the bot can no longer use a channel: what it is missing there, or that the channel is gone. */
function why(entry, missing) {
    if (entry.deleted) {
        return `**#${plain(entry.name ?? "a channel", 80)}** was deleted.`;
    }
    const where = `<#${entry.channelId}>`;
    if (missing && missing.length > 0) {
        return `${where}: I'm missing ${listOf(missing)} there.`;
    }
    return entry.posting ? `${where}: I can no longer post there.` : `${where}: I can no longer make threads there.`;
}

/** What stopped working in a channel, one line each. */
function stopped(entry) {
    const lines = [];
    for (const feedBoards of entry.feeds ?? []) {
        lines.push(`- The update feed for ${feedBoards.length > 0 ? boards(feedBoards) : "every board"} can't post there.`);
    }
    if (entry.audit) {
        lines.push("- The audit log can't be posted there.");
    }
    if ((entry.threadBoards ?? []).length > 0) {
        lines.push(`- Tasks on ${boards(entry.threadBoards)} can't get threads there.`);
    }
    if ((entry.postBoards ?? []).length > 0) {
        lines.push(`- The board post of ${boards(entry.postBoards)} there can't be kept up to date.`);
    }
    return lines;
}

/**
 * @param {Array<{ channelId: string, name: string, deleted: boolean, posting: boolean, threads: boolean,
 *   feeds: string[][], audit: boolean, threadBoards: string[], postBoards: string[] }>} lost
 * @param {(entry: object) => string[] | null} missingFor what the bot lacks in each channel
 */
function buildLostChannelsNotice(lost, missingFor) {
    const container = buildContainer({ title: "Some KanbanCord updates have stopped", accent: COLORS.warning });
    for (const entry of lost) {
        appendText(container, [why(entry, entry.deleted ? null : missingFor(entry)), ...stopped(entry)].join("\n"));
    }
    appendFooter(container, "Give me those permissions in the channel, or choose another channel: feeds and the audit log "
        + "with /kanbancord settings, threads with /board threads, or on the website. A board post updates again once "
        + "I can use its channel again.");
    return v2Payload(container);
}

/**
 * Board posts the bot could not update for lack of access, such as one in a thread.
 *
 * @param {Array<{ channelId: string, boardName: string, missing: string[] | null }>} posts
 */
function buildBlockedPostsNotice(posts) {
    const container = buildContainer({ title: "A board post can't be kept up to date", accent: COLORS.warning });
    appendText(container, posts.map((post) => {
        const missing = post.missing && post.missing.length > 0 ? ` (I'm missing ${listOf(post.missing)})` : "";
        return `- The post of **${plain(post.boardName, 60)}** in <#${post.channelId}>: I can no longer update it${missing}.`;
    }).join("\n"));
    appendFooter(container, "It updates again once I can see that channel and send messages there; nothing needs to be posted again.");
    return v2Payload(container);
}

/** A warning line for a settings view: what does not work in a channel, and what the bot is missing there. */
function missingLine(what, channelId, missing) {
    return `⚠️ **${what}:** I'm missing ${listOf(missing)} in <#${channelId}>.`;
}

module.exports = { buildLostChannelsNotice, buildBlockedPostsNotice, missingLine };
