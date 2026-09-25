const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { buildHelp } = require("../services/help/helpService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("What KanbanCord can do, and its commands")
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.reply(buildHelp(ctx.client.commands));
    },
};
