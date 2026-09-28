const { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { saveFeed, serverSettings, setAuditChannel } = require("../services/settings/notificationSettings");
const { successContainer } = require("../ui/containers");
const { buildServerNotificationsPanel } = require("../ui/settingsViews");

const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("kanbancord")
        .setDescription("Where KanbanCord posts about this server")
        .setContexts(InteractionContextType.Guild)
        // Shown to server managers only; KanbanCord still checks each change itself.
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName("settings").setDescription("Show the audit log channel and update feeds"))
        .addSubcommand((sub) =>
            sub.setName("audit-channel").setDescription("Set the channel that mirrors the audit log, or turn it off")
                .addChannelOption((option) =>
                    option.setName("channel").setDescription("The channel; leave out to turn it off").addChannelTypes(...POSTABLE)))
        .addSubcommand((sub) =>
            sub.setName("feed").setDescription("Add an update feed to a channel")
                .addChannelOption((option) =>
                    option.setName("channel").setDescription("Where to post updates").setRequired(true).addChannelTypes(...POSTABLE))
                .addStringOption((option) =>
                    option.setName("board").setDescription("Only this board (every board if left out)").setAutocomplete(true))
                .addBooleanOption((option) =>
                    option.setName("interactive").setDescription("Show the whole task with buttons to change it (on for a new feed)"))),

    info: {
        subcommands: {
            settings: {
                description: "Shows where the bot posts about this server: the audit log channel and each update feed. "
                    + "Only you see it.",
                examples: ["/kanbancord settings"],
            },
            "audit-channel": {
                description: "Sets the channel where every change is posted, as in the audit log. It never mentions anyone.",
                examples: ["/kanbancord audit-channel channel:#kanban-log", "/kanbancord audit-channel"],
                notes: "Leave out the channel to turn the audit log channel off.",
            },
            feed: {
                description: "Adds an update feed with the usual events: tasks, people, new comments, labels and board "
                    + "changes, mentioning people when they are assigned.",
                examples: ["/kanbancord feed channel:#updates", "/kanbancord feed channel:#design board:Design interactive:False"],
                notes: "If the channel already has a feed for the same board (or for every board), that feed is "
                    + "updated instead of adding another; a different channel or board adds a new feed. Leaving out "
                    + "interactive keeps an existing feed's setting. Choose events and which of them mention people in "
                    + "Server settings → Notifications on the website. You are never pinged or messaged about your own "
                    + "changes. The bot must be able to view the channel and send messages there.",
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        const options = ctx.interaction.options;
        await ctx.defer({ ephemeral: true });
        switch (options.getSubcommand()) {
            case "settings":
                return ctx.reply(buildServerNotificationsPanel(await serverSettings(ctx)));
            case "audit-channel": {
                const channel = options.getChannel("channel");
                await setAuditChannel(ctx, channel?.id ?? null);
                return ctx.reply(successContainer(null, channel
                    ? `Every change is now posted in <#${channel.id}>.`
                    : "The audit log channel is off."));
            }
            case "feed": {
                const channel = options.getChannel("channel", true);
                const { board, updated, interactive } = await saveFeed(ctx, channel.id, options.getString("board"),
                    options.getBoolean("interactive"));
                const about = board ? `**${board.name}**` : "every board";
                const style = interactive
                    ? "Each post shows the whole task, with buttons to move it, assign people, edit or follow it. "
                    : "Posts show what changed, without buttons. ";
                const what = updated
                    ? `Updated the feed for ${about} in <#${channel.id}>. `
                    : `Updates about ${about} will be posted in <#${channel.id}>. `;
                return ctx.reply(successContainer(null, `${what}${style}Choose its events and mentions on the website.`));
            }
        }
    },

    autocomplete: respondBoardOptions,
};
