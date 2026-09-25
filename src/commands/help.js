const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { buildHelp, buildHelpDetail, helpChoices } = require("../services/help/helpService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("What KanbanCord can do, and how to use its commands")
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
        .addStringOption((option) =>
            option.setName("command").setDescription("A command to explain in detail").setAutocomplete(true)),

    info: {
        description: "Lists every command, or explains one in detail: what it does, how to use it, and examples.",
        examples: ["/help", "/help command:board view"],
        notes: "In usage lines, <angle brackets> are required and [square brackets] are optional.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        const command = ctx.interaction.options.getString("command");
        const commands = ctx.client.commands;
        await ctx.reply(command ? buildHelpDetail(commands, command) : buildHelp(commands));
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async autocomplete(ctx) {
        await ctx.interaction.respond(helpChoices(ctx.client.commands, ctx.interaction.options.getFocused()));
    },
};
