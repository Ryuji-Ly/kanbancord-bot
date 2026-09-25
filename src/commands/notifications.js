const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { mySettings } = require("../services/settings/notificationSettings");
const { buildMyNotificationsPanel } = require("../ui/settingsViews");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("notifications")
        .setDescription("What the bot tells you by direct message")
        .setContexts(InteractionContextType.Guild),

    info: {
        description: "Shows what the bot sends you by direct message, and lets you change when it does and how "
            + "much this server may message you. Only you see it.",
        examples: ["/notifications"],
        notes: "Which events you hear about is chosen on the website, in Settings → Notifications.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer({ ephemeral: true });
        await ctx.reply(buildMyNotificationsPanel(await mySettings(ctx), ctx.guildId, ctx.interaction.guild?.name));
    },
};
