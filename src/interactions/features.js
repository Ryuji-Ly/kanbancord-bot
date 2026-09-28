const { registerComponentHandler } = require("../utils/interactionRouter");
const { FEATURES, buildFeaturesPanel, featureChanges } = require("../ui/featureViews");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * The features panel's menu and buttons. The API decides who may change features (the same people as
 * on the website); the panel is redrawn from what it says is on afterwards.
 */

const WANTED = {
    set: (ctx) => ctx.interaction.values ?? [],
    simple: () => [],
    all: () => FEATURES.map((feature) => feature.key),
};

registerComponentHandler("feat", async (ctx, { action }) => {
    const wanted = WANTED[action];
    if (!wanted) {
        throw new UserFacingError("Not available", "That action is not available here.");
    }
    await ctx.deferUpdate();
    const enabled = await ctx.api.put("/features", { body: featureChanges(wanted(ctx)) });
    await ctx.update(buildFeaturesPanel(enabled ?? {}));
});
