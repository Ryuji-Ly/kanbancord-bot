const { ChannelType, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { boardListView, boardView } = require("../services/boards/viewService");
const flows = require("../services/boards/commandService");
const { boardThreads } = require("../services/boards/threadSettings");
const { boardOption } = require("../utils/commandOptions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("board")
        .setDescription("This server's KanbanCord boards")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) => sub.setName("list").setDescription("List the boards you can see"))
        .addSubcommand((sub) =>
            sub.setName("view").setDescription("Show a board's columns and tasks").addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("create").setDescription("Create a board with To Do, In Progress and Done columns")
                .addStringOption((option) =>
                    option.setName("name").setDescription("The board's name").setRequired(true).setMaxLength(100))
                .addStringOption((option) =>
                    option.setName("description").setDescription("What the board is for").setMaxLength(500)))
        .addSubcommand((sub) =>
            sub.setName("edit").setDescription("Change a board's name and description").addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("archive").setDescription("Archive a board: it stays, read-only").addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("restore").setDescription("Bring back an archived board").addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("post").setDescription("Post a board here that keeps itself up to date").addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("threads").setDescription("A thread per task: show the board's setting, or change it")
                .addStringOption(boardOption())
                .addBooleanOption((option) => option.setName("enabled").setDescription("Give each task its own thread"))
                .addChannelOption((option) => option.setName("channel")
                    .setDescription("One of the board's feed channels, where the threads go")
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
                .addBooleanOption((option) => option.setName("private")
                    .setDescription("Private threads: only the task's creator and assignees (public if left off)"))
                .addStringOption((option) => option.setName("updates")
                    .setDescription("Where a task's updates go once it has a thread")
                    .addChoices(
                        { name: "The thread and the channel", value: "BOTH" },
                        { name: "Only the thread", value: "THREAD" },
                        { name: "Only the channel", value: "CHANNEL" },
                    ))),

    info: {
        subcommands: {
            list: {
                description: "Lists every board in this server you can see, archived ones last, with a menu to open one "
                    + "and a button to create one.",
                examples: ["/board list"],
            },
            view: {
                description: "Shows each column with its first few tasks, with menus to open a column or a task and "
                    + "buttons to add a task or a column, edit the board or go back to all boards. A column has buttons "
                    + "to add a task there, rename, move or delete it.",
                examples: ["/board view board:Sprint"],
                notes: "Start typing and pick the board from the list. Anyone can use the buttons; whether they may "
                    + "make the change is checked when they click.",
            },
            create: {
                description: "Creates a board with To Do, In Progress and Done columns, set up with the server's "
                    + "permissions.",
                examples: ["/board create name:Sprint 12", "/board create name:Design description:Mockups and reviews"],
                notes: "Board permissions and settings are on the website.",
            },
            edit: {
                description: "Opens a form with the board's name and description to change them.",
                examples: ["/board edit board:Sprint"],
            },
            archive: {
                description: "Archives the board: everything stays, but nothing can be changed until it is restored.",
                examples: ["/board archive board:Sprint 11"],
            },
            restore: {
                description: "Makes an archived board usable again.",
                examples: ["/board restore board:Sprint 11"],
            },
            post: {
                description: "Posts the whole board in this channel or thread, and edits the post whenever the board "
                    + "changes. Anyone can open its columns and tasks, or add a task, privately; what they can change "
                    + "depends on their own permissions.",
                examples: ["/board post board:Sprint"],
                notes: "Needs permission to edit the board's details. If some people who can see this channel cannot "
                    + "see the board, you are asked first. To stop a post, delete its message.",
            },
            threads: {
                description: "Gives each task on the board its own thread for discussion, in one of the board's update "
                    + "feed channels: started from the task's post there, or on its own. Threads follow the task's title "
                    + "and are archived when the task is deleted or archived. With no options, shows the setting.",
                examples: [
                    "/board threads board:Sprint",
                    "/board threads board:Sprint enabled:True",
                    "/board threads board:Sprint private:True updates:Only the thread",
                    "/board threads board:Sprint enabled:False",
                ],
                notes: "Needs permission to edit the board's details, and a feed for the board (`/kanbancord feed`). "
                    + "Public by default; private threads include the task's creator and assignees and need a text "
                    + "channel. Updates go to both the thread and the channel unless you choose otherwise. Comments made "
                    + "in KanbanCord are posted in the thread; messages in the thread stay in Discord.",
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        const options = ctx.interaction.options;
        switch (options.getSubcommand()) {
            case "list":
                await ctx.defer();
                return ctx.reply(await boardListView(ctx));
            case "view":
                await ctx.defer();
                return ctx.reply(await boardView(ctx, options.getString("board", true)));
            case "create":
                return flows.boardCreate(ctx);
            case "edit":
                return flows.boardEdit(ctx);
            case "archive":
                return flows.boardArchive(ctx, true);
            case "restore":
                return flows.boardArchive(ctx, false);
            case "post":
                return flows.boardPost(ctx);
            case "threads":
                await ctx.defer({ ephemeral: true });
                return ctx.reply(await boardThreads(ctx, options.getString("board", true), {
                    enabled: options.getBoolean("enabled"),
                    channelId: options.getChannel("channel")?.id ?? null,
                    privateThreads: options.getBoolean("private"),
                    updates: options.getString("updates"),
                }));
        }
    },

    autocomplete: respondBoardOptions,
};
