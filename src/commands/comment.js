const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOrTask } = require("../services/boards/autocomplete");
const { commentViewFor } = require("../services/boards/viewService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("comment")
        .setDescription("Read the discussion on a task")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
            sub
                .setName("list")
                .setDescription("Show a task's comments, newest first")
                .addStringOption((option) =>
                    option.setName("board").setDescription("The board the task is on").setRequired(true).setAutocomplete(true))
                .addStringOption((option) =>
                    option.setName("task").setDescription("The task").setRequired(true).setAutocomplete(true)),
        ),

    info: {
        description: "Comments are the discussion on a task.",
        subcommands: {
            list: {
                description: "Shows a task's comments five at a time, newest first.",
                examples: ["/comment list board:Sprint task:Fix login"],
                notes: "Only works on boards with comments switched on.",
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer();
        const options = ctx.interaction.options;
        if (options.getSubcommand() === "list") {
            await ctx.reply(await commentViewFor(ctx, options.getString("board", true), options.getString("task", true)));
        }
    },

    autocomplete: respondBoardOrTask,
};
