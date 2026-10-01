const { UserFacingError } = require("../../utils/errorMessages");
const { listBoards, resolveBoard } = require("../boards/boardData");

/**
 * Notification settings from Discord: quick changes, with everything else on the website. Personal
 * settings are the user's own; server settings need server administration, which the API checks.
 */

const DM_MODES = ["UNLESS_PINGED", "ALWAYS", "NEVER"];
const SERVER_MODES = ["DEFAULT", "ASSIGNMENTS", "NONE"];

/** @param {import("../../utils/interactionContext").InteractionContext} ctx */
async function mySettings(ctx) {
    return ctx.api.myNotifications.get();
}

async function setDmMode(ctx, mode) {
    if (!DM_MODES.includes(mode)) {
        throw new UserFacingError("Not available", "That is not a direct message setting.");
    }
    return ctx.api.myNotifications.update({ dmMode: mode });
}

/** How much this server may message the user: DEFAULT, ASSIGNMENTS or NONE. */
async function setServerMode(ctx, mode) {
    if (!SERVER_MODES.includes(mode)) {
        throw new UserFacingError("Not available", "That is not a server setting.");
    }
    return ctx.api.myNotifications.update({ servers: { [ctx.guildId]: mode } });
}

async function serverSettings(ctx) {
    const [settings, boards] = await Promise.all([ctx.api.get("/notifications"), listBoards(ctx)]);
    return { settings, boards };
}

/** @param {string | null} channelId null turns the audit channel off */
async function setAuditChannel(ctx, channelId) {
    return ctx.api.put("/notifications/audit-channel", { body: { channelId } });
}

/** Whether a feed covers exactly these boards (none: every board). */
function sameBoards(feed, boardIds) {
    const covered = (feed.boardIds ?? []).map(Number).sort((a, b) => a - b);
    const wanted = boardIds.map(Number).sort((a, b) => a - b);
    return covered.length === wanted.length && covered.every((id, index) => id === wanted[index]);
}

/**
 * The feed for a channel and a board (or every board). If the channel already has a feed for exactly
 * that, it is updated rather than doubled; otherwise a new one starts with the default events. Its
 * events and mentions are changed in its editor (`/kanbancord settings`) or on the website.
 *
 * @param {boolean | null} interactive null: as it was for an existing feed, on for a new one
 * @returns {Promise<{ feedId: number, board: object | null, updated: boolean, interactive: boolean }>}
 */
async function saveFeed(ctx, channelId, boardInput, interactive = null) {
    const board = boardInput ? await resolveBoard(ctx, boardInput) : null;
    const boardIds = board ? [board.boardId] : [];
    const current = await ctx.api.get("/notifications");
    const existing = (current?.feeds ?? []).find((feed) => feed.channelId === String(channelId) && sameBoards(feed, boardIds));
    if (existing) {
        const saved = await ctx.api.put(`/notifications/feeds/${existing.feedId}`, {
            body: interactive === null ? {} : { interactive },
        });
        return { feedId: existing.feedId, board, updated: true, interactive: Boolean(saved?.interactive ?? existing.interactive) };
    }
    const saved = await ctx.api.post("/notifications/feeds", { body: { channelId, boardIds, interactive: interactive ?? true } });
    return { feedId: saved?.feedId, board, updated: false, interactive: Boolean(saved?.interactive ?? interactive ?? true) };
}

module.exports = { DM_MODES, SERVER_MODES, mySettings, setDmMode, setServerMode, serverSettings, setAuditChannel, saveFeed };
