const { registerComponentHandler } = require("../utils/interactionRouter");
const { mySettings, setDmMode, setServerMode } = require("../services/settings/notificationSettings");
const { buildMyNotificationsPanel } = require("../ui/settingsViews");
const { UserFacingError } = require("../utils/errorMessages");

/** The /notifications panel's menus: each change is saved, then the panel shows the result. */
registerComponentHandler("ntf", async (ctx, { action }) => {
    const choice = ctx.interaction.values?.[0];
    await ctx.deferUpdate();
    if (action === "mode") {
        await setDmMode(ctx, choice);
    } else if (action === "server") {
        await setServerMode(ctx, choice);
    } else {
        throw new UserFacingError("Not available", "That setting is not available here.");
    }
    await ctx.update(buildMyNotificationsPanel(await mySettings(ctx), ctx.guildId, ctx.interaction.guild?.name));
});
