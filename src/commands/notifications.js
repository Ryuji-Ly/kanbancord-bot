const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { mySettings } = require("../services/settings/notificationSettings");
const { buildMyNotificationsPanel } = require("../ui/settingsViews");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("notifications")
        .setDescription("What the bot tells you by direct message")
        .setContexts(InteractionContextType.Guild),

    info: {
        description: "Shows what the bot sends you by direct message, and lets you change it: when it messages you, "
            + "how much this server may, which events you hear about, and whether that includes tasks you follow or "
            + "commented on. Only you see it.",
        examples: ["/notifications"],
        notes: "The same settings are in Settings → Notifications on the website. Every direct message also has a "
            + "button to stop messages from its server.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer({ ephemeral: true });
        await ctx.reply(buildMyNotificationsPanel(await mySettings(ctx), ctx.guildId, ctx.interaction.guild?.name));
    },
};
