const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { AUDIT_TYPES, auditPage, filterFromOptions } = require("../services/audit/auditLog");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("audit")
        .setDescription("Browse the server's audit log, newest first")
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) =>
            option.setName("board").setDescription("Only changes on this board").setAutocomplete(true))
        .addUserOption((option) =>
            option.setName("user").setDescription("Only changes made by this person"))
        .addStringOption((option) =>
            option.setName("type").setDescription("Only this kind of change")
                .addChoices(...Object.entries(AUDIT_TYPES).map(([value, { label }]) => ({ name: label, value })))),

    info: {
        description: "Shows the server's audit log, newest first, with a button for older changes. Only you see it. "
            + "The filters combine: a board, a person and a kind of change.",
        examples: ["/audit", "/audit board:Sprint type:Tasks", "/audit user:@Mia"],
        notes: "Needs permission to view the audit log, just like the audit log on the website.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer({ ephemeral: true });
        await ctx.reply(await auditPage(ctx, await filterFromOptions(ctx)));
    },

    autocomplete: respondBoardOptions,
};
