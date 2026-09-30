const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { boardListView, boardView } = require("../services/boards/viewService");
const flows = require("../services/boards/commandService");
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
            sub.setName("post").setDescription("Post a board here that keeps itself up to date").addStringOption(boardOption())),

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
        }
    },

    autocomplete: respondBoardOptions,
};
