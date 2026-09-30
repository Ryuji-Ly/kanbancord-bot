const { PermissionFlagsBits } = require("discord.js");
const { infoContainer } = require("../../ui/containers");

/**
 * A tip for server managers on a brand-new server: it is in simple mode, and more can be switched on.
 * Shown while the server has no boards and everything is as a new server starts (every feature off,
 * open permissions off); once it has a board or anything was changed, never again. Nothing is stored:
 * the answer is worked out from the server as it is, and remembered here once it is "no".
 */

/** Servers that no longer need the tip, until the bot restarts. */
const settled = new Set();

/** Commands that already cover it. */
const SKIPPED = new Set(["kanbancord", "guide", "help"]);

const TIP = infoContainer(
    "Tip: this server is in simple mode",
    "Boards have columns, and tasks a title and a description; nothing else to learn. When you need more, "
        + "`/kanbancord features` switches on assignees, due dates, priorities, labels and comments. "
        + "`/guide` walks through everything step by step.\n-# Only server managers see this, until the first board.",
);

/**
 * The tip, or null. Worked out as the user who ran the command, before it runs (so creating the first
 * board still shows it). Never fails: a tip is not worth breaking a command over.
 */
async function simpleModeHint(ctx) {
    const interaction = ctx.interaction;
    const guildId = ctx.guildId;
    if (!guildId || settled.has(guildId) || SKIPPED.has(interaction.commandName)
        || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return null;
    }
    try {
        // Straight from the API rather than the cached board list: the command runs at the same time,
        // and a copy cached here could hide a board it just created.
        const [features, open, boards] = await Promise.all([
            ctx.api.get("/features"),
            ctx.api.get("/features/open-permissions"),
            ctx.api.get("/boards", { query: { size: 1 } }),
        ]);
        const hasBoards = (boards?.content?.length ?? 0) > 0;
        const untouched = !hasBoards && !Object.values(features ?? {}).some(Boolean) && !open?.enabled;
        if (!untouched) {
            settled.add(guildId);
            return null;
        }
        return TIP;
    } catch {
        return null;
    }
}

/** For tests. */
function forgetSettled() {
    settled.clear();
}

module.exports = { simpleModeHint, forgetSettled };
