const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOrTask } = require("../services/boards/autocomplete");
const { taskView } = require("../services/boards/viewService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("task")
        .setDescription("Work with tasks on a board")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
            sub
                .setName("view")
                .setDescription("Show a task in full")
                .addStringOption((option) =>
                    option.setName("board").setDescription("The board the task is on").setRequired(true).setAutocomplete(true))
                .addStringOption((option) =>
                    option.setName("task").setDescription("The task").setRequired(true).setAutocomplete(true)),
        ),

    info: {
        subcommands: {
            view: {
                description: "Shows a task's details, description, images and who is assigned, with buttons for its "
                    + "comments and to open it on the website.",
                examples: ["/task view board:Sprint task:Fix login"],
                notes: "Pick the board first; the task list then shows that board's tasks.",
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer();
        const options = ctx.interaction.options;
        if (options.getSubcommand() === "view") {
            await ctx.reply(await taskView(ctx, options.getString("board", true), options.getString("task", true)));
        }
    },

    autocomplete: respondBoardOrTask,
};
