const { ChannelType } = require("discord.js");
const { resolveBoard } = require("./boardData");
const { appendDivider, appendFooter, appendText, buildContainer } = require("../../ui/containers");
const { UserFacingError } = require("../../utils/errorMessages");
const { plain } = require("../../utils/format");
const { listOf, missingIn, threadNeeds } = require("../permissions/botAccess");
const { missingLine } = require("../../ui/permissionNoticeViews");

/**
 * /board threads: a thread per task for one board, in one of its feed channels. Shows the settings,
 * or changes them: options left out keep what the board has. The API checks the person may change
 * the board.
 */

const UPDATES = {
    BOTH: "the thread and the channel",
    THREAD: "only the thread",
    CHANNEL: "only the channel",
};

/** Refuses a channel the bot could not make that kind of thread in, saying what to give it. */
function requireCanThreadIn(ctx, channelId, privateThreads) {
    const guild = ctx.interaction.guild;
    const channel = guild?.channels.cache.get(channelId);
    const me = guild?.members.me;
    const permissions = channel && me ? channel.permissionsFor(me) : null;
    if (!permissions) {
        return;
    }
    const where = `<#${channelId}>`;
    if (privateThreads && channel.type !== ChannelType.GuildText) {
        throw new UserFacingError("No private threads there", `${where} is an announcement channel, which can only have `
            + "public threads. Leave private off, or use a feed in a text channel.");
    }
    const missing = missingIn(guild, channelId, threadNeeds(privateThreads));
    if (missing && missing.length > 0) {
        throw new UserFacingError("Can't make threads there", `I'm missing ${listOf(missing)} in ${where}, so I can't `
            + "make task threads there. Give me that, or pick another feed channel.");
    }
}

/**
 * The board's thread settings, as text. `missing`: what the bot lacks in the chosen channel, when
 * threads are on but cannot be made there.
 */
function threadsPanel(board, settings, notice, missing = null) {
    const container = buildContainer({ title: `Task threads · ${plain(board.name, 80)}` });
    if (notice) {
        appendText(container, notice);
        appendDivider(container);
    }
    const channel = (id) => (id ? `<#${id}>` : "none");
    if (!settings.enabled) {
        appendText(container, "**Off.** Switch on to give each task its own thread for discussion, in one of the "
            + "board's update feed channels.");
    } else {
        appendText(container, [
            settings.active ? "**On.**" : "**On, but not working:** the channel no longer has a feed for this board. "
                + "Add one there, or choose another feed channel.",
            `**Channel:** ${channel(settings.channelId)}`,
            `**Threads:** ${settings.privateThreads ? "private: the task's creator and assignees" : "public"}`,
            `**A task's updates go to:** ${UPDATES[settings.updates] ?? settings.updates}`,
        ].join("\n"));
        if (missing && missing.length > 0) {
            appendText(container, missingLine("No new threads", settings.channelId, missing));
        }
    }
    if (settings.channels.length === 0) {
        appendText(container, "-# This board has no update feed yet. Add one with `/kanbancord feed`, then switch threads on.");
    } else {
        appendText(container, `-# Feed channels for this board: ${settings.channels.map((entry) => channel(entry.channelId)).join(", ")}`);
    }
    return appendFooter(container, "Change with /board threads and its options; options you leave out stay as they are.");
}

/**
 * @param {{ enabled: boolean | null, channelId: string | null, privateThreads: boolean | null, updates: string | null }} changes
 */
async function boardThreads(ctx, boardInput, changes) {
    const board = await resolveBoard(ctx, boardInput);
    const path = `/boards/${board.boardId}/threads`;
    const current = await ctx.api.get(path);
    const asked = Object.values(changes).some((value) => value !== null);
    if (!asked) {
        return threadsPanel(board, current, null, threadProblem(ctx, current));
    }
    if (changes.enabled === false) {
        const after = await ctx.api.delete(path);
        return threadsPanel(board, after, "Threads are off for this board. Threads already made stay as they are.");
    }

    let channelId = changes.channelId ?? current.channelId;
    if (!channelId) {
        if (current.channels.length === 1) {
            channelId = current.channels[0].channelId;
        } else if (current.channels.length === 0) {
            throw new UserFacingError("No feed yet", "Threads go in a channel with an update feed for this board. Add one "
                + "with `/kanbancord feed`, then switch threads on.");
        } else {
            throw new UserFacingError("Which channel?", "This board has more than one feed channel: "
                + `${current.channels.map((entry) => `<#${entry.channelId}>`).join(", ")}. Choose one with the channel option.`);
        }
    }
    const privateThreads = changes.privateThreads ?? (current.enabled ? current.privateThreads : false);
    const updates = changes.updates ?? (current.enabled ? current.updates : "BOTH");
    requireCanThreadIn(ctx, channelId, privateThreads);
    const after = await ctx.api.put(path, { body: { channelId, privateThreads, updates } });
    return threadsPanel(board, after, current.enabled
        ? "Saved. New threads follow these settings."
        : "Threads are on: each task gets its own thread when something next happens to it.");
}

/** What the bot lacks to make the board's threads where they are set to go, if they are on. */
function threadProblem(ctx, settings) {
    return settings.enabled && settings.channelId
        ? missingIn(ctx.interaction.guild, settings.channelId, threadNeeds(settings.privateThreads))
        : null;
}

module.exports = { boardThreads, threadsPanel, requireCanThreadIn };
