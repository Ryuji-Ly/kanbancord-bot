const { registerComponentHandler } = require("../utils/interactionRouter");
const { loadFeatures } = require("../services/settings/features");
const { buildFeaturesPanel, everythingOn, featureChanges, openPermissionsWarning } = require("../ui/featureViews");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * The features panel's menu and buttons, and open permissions. The API decides who may change them
 * (the same people as on the website); the panel is redrawn from what it says afterwards.
 */

async function setFeatures(ctx, keys) {
    await ctx.api.put("/features", { body: featureChanges(keys) });
}

async function setOpen(ctx, enabled) {
    await ctx.api.put("/features/open-permissions", { body: { enabled } });
}

registerComponentHandler("feat", async (ctx, { action }) => {
    await ctx.deferUpdate();
    const current = await loadFeatures(ctx);
    switch (action) {
        case "set":
            await setFeatures(ctx, ctx.interaction.values ?? []);
            break;
        case "simple":
            await setFeatures(ctx, []);
            break;
        case "all":
            await setFeatures(ctx, everythingOn(current.enabled, current.open));
            break;
        case "open":
            return ctx.update(openPermissionsWarning(current.enabled.PERMISSIONS));
        case "openyes":
            await setOpen(ctx, true);
            break;
        case "close":
            await setOpen(ctx, false);
            break;
        case "back":
            break;
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
    const after = await loadFeatures(ctx);
    await ctx.update(buildFeaturesPanel(after.enabled, after.open));
});
