const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { KINDS, isConfigured, buildReportModal } = require("../services/report/reportService");
const { UserFacingError } = require("../utils/errorMessages");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("report")
        .setDescription("Report an issue or suggest something to the KanbanCord developer")
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Is this a problem, or an idea?")
                .setRequired(true)
                .addChoices(...Object.entries(KINDS).map(([value, { label }]) => ({ name: label, value }))),
        ),

    info: {
        description: "Sends a problem or an idea straight to the KanbanCord developer. A form opens for a title "
            + "and a description.",
        examples: ["/report type:Issue", "/report type:Suggestion"],
        notes: "For a problem, say what you did, what happened, and what you expected. One report per minute.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        if (!isConfigured()) {
            throw new UserFacingError("Reports are not set up", "This KanbanCord bot has no one to send reports to.");
        }
        await ctx.showModal(buildReportModal(ctx.interaction.options.getString("type", true)));
    },
};
