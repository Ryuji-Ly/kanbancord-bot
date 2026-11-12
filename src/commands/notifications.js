const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { mySettings } = require("../services/settings/notificationSettings");
const { buildMyNotificationsPanel } = require("../ui/settingsViews");
const { myReminders } = require("../services/settings/reminders");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { setMyTimeZone, timeZoneChoices } = require("../services/settings/timeZone");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("notifications")
        .setDescription("What the bot tells you by direct message")
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) => option.setName("reminders")
            .setDescription("Your own reminder times before a due date, like 1d, 3h; default to use the board's")
            .setMaxLength(100))
        .addStringOption((option) => option.setName("board")
            .setDescription("Your reminder times for this board only (every board if left out)").setAutocomplete(true))
        .addStringOption((option) => option.setName("timezone")
            .setDescription("Your time zone, for times you type, such as Europe/Berlin or UTC+8")
            .setMaxLength(64).setAutocomplete(true)),

    info: {
        description: "Shows what the bot sends you by direct message, and lets you change it: when it messages you, "
            + "how much this server may, which events you hear about, and whether that includes tasks you follow or "
            + "commented on. Only you see it.",
        examples: ["/notifications", "/notifications reminders:2h", "/notifications reminders:3d, 1d board:Sprint",
            "/notifications reminders:default", "/notifications timezone:Europe/Berlin"],
        notes: "The same settings are in Settings → Notifications on the website. Every direct message also has a "
            + "button to stop messages from its server. `reminders` sets when you are reminded before a task is due, "
            + "instead of the board's times: on every board, or with `board` on one (which wins over every board). "
            + "`none` leaves only the overdue reminder; `default` goes back to the board's times. `timezone` is the "
            + "time zone the times you type are read in, such as due dates; the website sets it from your device "
            + "unless you choose one here.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        await ctx.defer({ ephemeral: true });
        const timeZone = ctx.interaction.options.getString("timezone");
        if (timeZone) {
            return ctx.reply(await setMyTimeZone(ctx, timeZone));
        }
        const reminders = ctx.interaction.options.getString("reminders");
        if (reminders) {
            return ctx.reply(await myReminders(ctx, reminders, ctx.interaction.options.getString("board")));
        }
        await ctx.reply(buildMyNotificationsPanel(await mySettings(ctx), ctx.guildId, ctx.interaction.guild?.name));
    },

    async autocomplete(ctx) {
        const focused = ctx.interaction.options.getFocused(true);
        if (focused.name === "timezone") {
            return ctx.interaction.respond(timeZoneChoices(focused.value));
        }
        return respondBoardOptions(ctx);
    },
};
