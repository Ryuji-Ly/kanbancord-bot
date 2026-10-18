const { registerComponentHandler } = require("../utils/interactionRouter");
const { auditPage } = require("../services/audit/auditLog");
const { filterFromArgs } = require("../ui/auditViews");

/** The Newest and Older buttons under /audit: the same filter, another page. */
registerComponentHandler("audit", async (ctx, { action, args }) => {
    const before = action === "older" && Number(args[3]) > 0 ? args[3] : null;
    await ctx.deferUpdate();
    await ctx.update(await auditPage(ctx, filterFromArgs(args), before));
});
