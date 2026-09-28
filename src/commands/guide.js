const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { guideState } = require("../services/guide/guideState");
const { buildGuideOverview } = require("../ui/guideViews");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("guide")
        .setDescription("Step by step: set up boards, columns and tasks, and keep your team up to date")
        .setContexts(InteractionContextType.Guild),

    info: {
        description: "A step-by-step guide to KanbanCord, all in Discord: simple mode and features, boards, columns, "
            + "tasks, people, due dates, priorities and labels, board posts and feeds, and your own notifications. "
            + "Steps this server has already done are ticked off.",
        examples: ["/guide"],
        notes: "Only you can see the guide.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer({ ephemeral: true });
        await ctx.reply(buildGuideOverview(await guideState(ctx)));
    },
};
