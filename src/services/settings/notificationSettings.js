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

/**
 * A feed for a channel with the default events, for every board or one. Its details are changed on
 * the website.
 */
async function addFeed(ctx, channelId, boardInput) {
    const board = boardInput ? await resolveBoard(ctx, boardInput) : null;
    await ctx.api.post("/notifications/feeds", { body: { channelId, boardIds: board ? [board.boardId] : [] } });
    return board;
}

module.exports = { DM_MODES, SERVER_MODES, mySettings, setDmMode, setServerMode, serverSettings, setAuditChannel, addFeed };
