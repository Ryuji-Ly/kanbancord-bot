const { registerComponentHandler } = require("../utils/interactionRouter");
const { serverSettings } = require("../services/settings/notificationSettings");
const { listBoards } = require("../services/boards/boardData");
const { postingProblems } = require("../services/permissions/botAccess");
const {
    buildBoardFeedEditor,
    buildBoardFeedList,
    buildFeedDeleteConfirm,
    buildFeedEditor,
    eventsOf,
} = require("../ui/feedEditorViews");
const { buildServerNotificationsPanel } = require("../ui/settingsViews");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * The feed editors' menus and buttons. Each change is saved as the person who made it (the API
 * checks they may), then the panel shows the result.
 */

/** Every event on, or off, as the menu left it. */
function chosen(keys, values) {
    const picked = new Set(values);
    return Object.fromEntries(keys.map((key) => [key, picked.has(key)]));
}

async function feedEditor(ctx, feedId, notice) {
    const { settings, boards, problems } = await serverSettings(ctx);
    const feed = settings.feeds.find((entry) => String(entry.feedId) === String(feedId));
    if (!feed) {
        throw new UserFacingError("Feed not found", "That feed no longer exists. Run `/kanbancord settings` again.");
    }
    const channelName = settings.channels.find((channel) => channel.channelId === feed.channelId)?.name ?? null;
    const missing = problems.get(feed.channelId) ?? null;
    return { view: buildFeedEditor({ feed, catalogue: settings.catalogue, channelName, boards, notice, missing }), feed, settings };
}

registerComponentHandler("feedcfg", async (ctx, { action, args }) => {
    const [feedId] = args;
    const values = ctx.interaction.values ?? [];
    await ctx.deferUpdate();
    const path = `/notifications/feeds/${feedId}`;

    switch (action) {
        case "back":
            return ctx.update(buildServerNotificationsPanel(await serverSettings(ctx)));
        case "open":
            return ctx.update((await feedEditor(ctx, feedId ?? values[0])).view);
        case "ask": {
            const { feed, settings } = await feedEditor(ctx, feedId);
            const channelName = settings.channels.find((channel) => channel.channelId === feed.channelId)?.name;
            return ctx.update(buildFeedDeleteConfirm(feed, channelName));
        }
        case "delete":
            await ctx.api.delete(path);
            return ctx.update(buildServerNotificationsPanel(await serverSettings(ctx), "Deleted the feed."));
        case "events":
        case "mentions":
        case "boards":
        case "interactive":
        case "roles": {
            const { feed, settings } = await feedEditor(ctx, feedId);
            const events = eventsOf(settings.catalogue);
            const body = {
                events: action === "events" ? chosen(events.map((event) => event.key), values) : undefined,
                mentions: action === "mentions"
                    ? chosen(events.filter((event) => event.canMention).map((event) => event.key), values)
                    : undefined,
                boardIds: action === "boards" ? (values.includes("all") ? [] : values.map(Number)) : undefined,
                interactive: action === "interactive" ? !feed.interactive : undefined,
                mentionRoles: action === "roles" ? !feed.mentionRoles : undefined,
            };
            await ctx.api.put(path, { body });
            return ctx.update((await feedEditor(ctx, feedId, "Saved.")).view);
        }
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});

async function boardFeeds(ctx, boardId) {
    const board = (await listBoards(ctx)).find((entry) => String(entry.boardId) === String(boardId));
    if (!board) {
        throw new UserFacingError("Board not found", "That board no longer exists, or you can no longer see it.");
    }
    const notifications = await ctx.api.get(`/boards/${boardId}/notifications`);
    const problems = postingProblems(ctx.interaction.guild, notifications.feeds.map((feed) => feed.channelId));
    return { board, notifications, problems };
}

function boardFeedEditor(board, notifications, feedId, notice, problems = new Map()) {
    const feed = notifications.feeds.find((entry) => String(entry.feedId) === String(feedId));
    if (!feed) {
        throw new UserFacingError("Feed not found", "That feed no longer posts about this board.");
    }
    return buildBoardFeedEditor({ board, feed, catalogue: notifications.catalogue, notice, missing: problems.get(feed.channelId) ?? null });
}

registerComponentHandler("bfeed", async (ctx, { action, args }) => {
    const [boardId, feedId] = args;
    const values = ctx.interaction.values ?? [];
    await ctx.deferUpdate();
    const path = `/boards/${boardId}/notifications/feeds/${feedId}`;

    if (action === "list") {
        return ctx.update(buildBoardFeedList(await boardFeeds(ctx, boardId)));
    }
    if (action === "open") {
        const { board, notifications, problems } = await boardFeeds(ctx, boardId);
        return ctx.update(boardFeedEditor(board, notifications, values[0], undefined, problems));
    }
    if (action === "reset") {
        await ctx.api.delete(path);
        const { board, notifications, problems } = await boardFeeds(ctx, boardId);
        return ctx.update(boardFeedEditor(board, notifications, feedId, "This board follows the feed's settings again.", problems));
    }
    if (action === "events" || action === "mentions") {
        const { notifications } = await boardFeeds(ctx, boardId);
        const events = eventsOf(notifications.catalogue);
        const keys = action === "events"
            ? events.map((event) => event.key)
            : events.filter((event) => event.canMention).map((event) => event.key);
        // Values equal to the feed's own are dropped by the API, so the board follows the feed there.
        await ctx.api.put(path, { body: { [action]: chosen(keys, values) } });
        const { board, notifications: after, problems } = await boardFeeds(ctx, boardId);
        return ctx.update(boardFeedEditor(board, after, feedId, "Saved for this board.", problems));
    }
    throw new UserFacingError("Not available", "That action is not available here.");
});

module.exports = { boardFeeds };
