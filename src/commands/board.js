const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { boardChoices } = require("../services/boards/autocomplete");
const { boardListView, boardView } = require("../services/boards/viewService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("board")
        .setDescription("See this server's KanbanCord boards")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) => sub.setName("list").setDescription("List the boards you can see"))
        .addSubcommand((sub) =>
            sub
                .setName("view")
                .setDescription("Show a board's columns and tasks")
                .addStringOption((option) =>
                    option.setName("board").setDescription("The board").setRequired(true).setAutocomplete(true)),
        ),

    info: {
        subcommands: {
            list: {
                description: "Lists every board in this server you can see, archived ones last.",
                examples: ["/board list"],
            },
            view: {
                description: "Shows each column with its first few tasks. Open a column from the menu to page "
                    + "through all its tasks, then open a task from there.",
                examples: ["/board view board:Sprint"],
                notes: "Start typing and pick the board from the list.",
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer();
        const sub = ctx.interaction.options.getSubcommand();
        if (sub === "list") {
            await ctx.reply(await boardListView(ctx));
        } else if (sub === "view") {
            await ctx.reply(await boardView(ctx, ctx.interaction.options.getString("board", true)));
        }
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async autocomplete(ctx) {
        const focused = ctx.interaction.options.getFocused(true);
        await ctx.interaction.respond(focused.name === "board" ? await boardChoices(ctx, focused.value) : []);
    },
};
