const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { encode } = require("../utils/customId");
const { plain, truncate } = require("../utils/format");
const { appendDivider, appendFooter, appendText, buildContainer } = require("./containers");

/**
 * Editing update feeds in Discord: a feed's events, mentions, boards and style (for server managers),
 * and one board's own settings for a feed (for the board's managers). Every menu saves as it is
 * changed, then the panel shows the result.
 */

const MENU_MAX = 25;

/** Every event, in catalogue order, with its category's name. */
function eventsOf(catalogue) {
    return catalogue.flatMap((category) => category.events.map((event) => ({ ...event, category: category.label })));
}

function eventMenu(customId, placeholder, events, isOn) {
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(0)
        .setMaxValues(events.length)
        .addOptions(events.map((event) => ({
            label: truncate(event.label, 100),
            value: event.key,
            description: truncate(event.category, 100),
            default: isOn(event.key),
        }))));
}

function button(label, customId, style = ButtonStyle.Secondary) {
    return new ButtonBuilder().setCustomId(customId).setStyle(style).setLabel(label);
}

/** What a feed posts and mentions, as a sentence or two. */
function summary(events, posts, mentions) {
    const posted = events.filter((event) => posts(event.key));
    const mentioning = posted.filter((event) => event.canMention && mentions(event.key));
    return [
        `**Posts:** ${posted.length === 0 ? "nothing" : posted.length === events.length ? "every event" : `${posted.length} of ${events.length} events`}`,
        `**Mentions the people involved for:** ${mentioning.length === 0 ? "nothing" : mentioning.map((event) => event.label).join(", ")}`,
    ].join("\n");
}

/**
 * A feed, for server managers: boards, events, mentions, buttons on posts, and deleting it.
 *
 * @param {{ feed: object, catalogue: object[], channelName: string | null, boards: object[], notice?: string }} options
 */
function buildFeedEditor({ feed, catalogue, channelName, boards, notice }) {
    const events = eventsOf(catalogue);
    const mentionable = events.filter((event) => event.canMention);
    const posts = (key) => Boolean(feed.events?.[key]);
    const mentions = (key) => Boolean(feed.mentions?.[key]);
    const boardNames = new Map(boards.map((board) => [String(board.boardId), board.name]));
    const covered = (feed.boardIds ?? []).map(String);

    const container = buildContainer({ title: `Feed in #${plain(channelName ?? "a channel that no longer exists", 80)}` });
    if (notice) {
        appendText(container, notice);
        appendDivider(container);
    }
    appendText(container, [
        `**Boards:** ${covered.length === 0 ? "every board" : covered.map((id) => plain(boardNames.get(id) ?? `board #${id}`, 40)).join(", ")}`,
        summary(events, posts, mentions),
        `**Posts show:** ${feed.interactive ? "the whole task, with buttons to change it" : "what changed, without buttons"}`
            + ` · **Mentions roles:** ${feed.mentionRoles ? "yes, roles on the task too" : "no, people only"}`,
    ].join("\n"));

    container.addActionRowComponents(eventMenu(encode("feedcfg", "events", feed.feedId), "What it posts", events, posts));
    container.addActionRowComponents(eventMenu(encode("feedcfg", "mentions", feed.feedId),
        "Which posts mention the people involved", mentionable, mentions));
    const boardOptions = boards.slice(0, MENU_MAX - 1);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(encode("feedcfg", "boards", feed.feedId))
        .setPlaceholder("Which boards it covers")
        .setMinValues(1)
        .setMaxValues(boardOptions.length + 1)
        .addOptions([
            { label: "Every board", value: "all", description: "Including boards made later", default: covered.length === 0 },
            ...boardOptions.map((board) => ({
                label: truncate(board.name, 100),
                value: String(board.boardId),
                default: covered.includes(String(board.boardId)),
            })),
        ])));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        button(feed.interactive ? "Posts: with buttons" : "Posts: plain", encode("feedcfg", "interactive", feed.feedId)),
        button(feed.mentionRoles ? "Roles: mentioned" : "Roles: not mentioned", encode("feedcfg", "roles", feed.feedId)),
        button("Delete feed", encode("feedcfg", "ask", feed.feedId), ButtonStyle.Danger),
        button("All notifications", encode("feedcfg", "back")),
    ));
    return appendFooter(container, "Menus save as you change them. Boards can change one feed's settings for themselves "
        + "with /board notifications. Nobody is ever pinged about their own changes.");
}

function buildFeedDeleteConfirm(feed, channelName) {
    const container = buildContainer({
        title: "Delete this feed?",
        body: `Nothing more will be posted in #${plain(channelName ?? "that channel", 80)} by this feed. Posts already `
            + "there stay. Task threads that use this feed's channel stop getting new threads.",
    });
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        button("Delete feed", encode("feedcfg", "delete", feed.feedId), ButtonStyle.Danger),
        button("Keep it", encode("feedcfg", "open", feed.feedId)),
    ));
    return container;
}

/**
 * The feeds that post about a board, for the board's managers: each can be changed for this board
 * only.
 */
function buildBoardFeedList({ board, notifications, notice }) {
    const container = buildContainer({ title: `Notifications · ${plain(board.name, 80)}` });
    if (notice) {
        appendText(container, notice);
        appendDivider(container);
    }
    const feeds = notifications.feeds;
    if (feeds.length === 0) {
        appendText(container, "No feed posts about this board yet. A server manager can add one with `/kanbancord feed`.");
        return appendFooter(container, "Then change what it posts for this board here.");
    }
    appendText(container, feeds.map((feed) => {
        const where = `#${plain(feed.channelName ?? "a channel that no longer exists", 60)}`;
        const scope = feed.everyBoard ? "every board" : "chosen boards";
        const own = feed.own.changes > 0 ? `${feed.own.changes} change${feed.own.changes === 1 ? "" : "s"} for this board` : "follows the feed";
        return `- ${where} · ${scope} · ${own}`;
    }).join("\n"));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(encode("bfeed", "open", board.boardId))
        .setPlaceholder("Change what a feed posts for this board")
        .addOptions(feeds.slice(0, MENU_MAX).map((feed) => ({
            label: truncate(`#${feed.channelName ?? "deleted channel"}`, 100),
            value: String(feed.feedId),
            description: feed.everyBoard ? "Every board" : "Chosen boards",
        })))));
    return appendFooter(container, "Changes here are for this board only; the feed's own settings stay as they are.");
}

/** One feed as it treats this board: the feed's settings, with the board's changes on top. */
function buildBoardFeedEditor({ board, feed, catalogue, notice }) {
    const events = eventsOf(catalogue);
    const mentionable = events.filter((event) => event.canMention);
    const posts = (key) => feed.own.events[key] ?? Boolean(feed.feedEvents[key]);
    const mentions = (key) => feed.own.mentions[key] ?? Boolean(feed.feedMentions[key]);

    const container = buildContainer({
        title: `#${plain(feed.channelName ?? "deleted channel", 60)} · for ${plain(board.name, 60)}`,
    });
    if (notice) {
        appendText(container, notice);
        appendDivider(container);
    }
    const changed = [...new Set([...Object.keys(feed.own.events), ...Object.keys(feed.own.mentions)])]
        .map((key) => events.find((event) => event.key === key)?.label ?? key);
    appendText(container, [
        summary(events, posts, mentions),
        changed.length === 0
            ? "-# Follows the feed's own settings."
            : `-# Changed for this board: ${changed.join(", ")}`,
    ].join("\n"));
    container.addActionRowComponents(eventMenu(encode("bfeed", "events", board.boardId, feed.feedId),
        "What it posts about this board", events, posts));
    container.addActionRowComponents(eventMenu(encode("bfeed", "mentions", board.boardId, feed.feedId),
        "Which of those mention the people involved", mentionable, mentions));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        button("Use the feed's settings", encode("bfeed", "reset", board.boardId, feed.feedId)).setDisabled(changed.length === 0),
        button("Other feeds", encode("bfeed", "list", board.boardId)),
    ));
    return appendFooter(container, "Menus save as you change them, for this board only.");
}

module.exports = { buildFeedEditor, buildFeedDeleteConfirm, buildBoardFeedList, buildBoardFeedEditor, eventsOf };
