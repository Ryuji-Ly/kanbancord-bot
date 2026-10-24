const { registerComponentHandler } = require("../utils/interactionRouter");
const { buildHelp } = require("../services/help/helpService");

/** Turning the pages of /help's overview. */

registerComponentHandler("help", async (ctx, { args }) => {
    await ctx.deferUpdate();
    return ctx.update(buildHelp(ctx.client.commands, Number(args[0])));
});
