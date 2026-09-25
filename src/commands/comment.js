const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { commentViewFor } = require("../services/boards/viewService");
const { commentAdd } = require("../services/boards/commandService");
const { withBoardAndTask } = require("../utils/commandOptions");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("comment")
        .setDescription("The discussion on a task")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) => withBoardAndTask(sub.setName("list").setDescription("Show a task's comments, newest first")))
        .addSubcommand((sub) => withBoardAndTask(sub.setName("add").setDescription("Comment on a task"))),

    info: {
        subcommands: {
            list: {
                description: "Shows a task's comments five at a time, newest first.",
                examples: ["/comment list board:Sprint task:Fix login"],
                notes: "Only works on boards with comments switched on.",
            },
            add: {
                description: "Opens a form to write a comment on the task.",
                examples: ["/comment add board:Sprint task:Fix login"],
                notes: "Markdown works, like on the website.",
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        const options = ctx.interaction.options;
        if (options.getSubcommand() === "add") {
            return commentAdd(ctx);
        }
        await ctx.defer();
        await ctx.reply(await commentViewFor(ctx, options.getString("board", true), options.getString("task", true)));
    },

    autocomplete: respondBoardOptions,
};
