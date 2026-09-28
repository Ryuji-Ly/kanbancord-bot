const { registerComponentHandler } = require("../utils/interactionRouter");
const { guideState } = require("../services/guide/guideState");
const { STEPS, buildGuideOverview, buildGuideStep } = require("../ui/guideViews");

/** Turning the guide's pages. The ticks are worked out again each time, so they follow along. */

registerComponentHandler("guide", async (ctx, { action, args }) => {
    const target = action === "jump" ? ctx.interaction.values?.[0] : args[0];
    await ctx.deferUpdate();
    const state = await guideState(ctx);
    const index = Number(target);
    if (target === "overview" || !Number.isInteger(index) || index < 0 || index >= STEPS.length) {
        return ctx.update(buildGuideOverview(state));
    }
    return ctx.update(buildGuideStep(index, state));
});
