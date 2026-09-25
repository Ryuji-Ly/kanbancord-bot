const { registerModalHandler } = require("../utils/interactionRouter");
const { KINDS, claimCooldown, deliverReport } = require("../services/report/reportService");
const { successContainer } = require("../ui/containers");

/** The /report form, submitted. */
registerModalHandler("report", async (ctx, { action, args }) => {
    if (action !== "submit") {
        return;
    }
    const kind = KINDS[args[0]] ? args[0] : "issue";
    const fields = ctx.interaction.fields;

    claimCooldown(ctx.user.id);
    await ctx.defer({ ephemeral: true });
    await deliverReport(ctx.client, {
        kind,
        title: fields.getTextInputValue("title").trim(),
        description: fields.getTextInputValue("description").trim(),
        reporter: ctx.user,
        guild: ctx.interaction.guild,
    });
    await ctx.reply(successContainer("Thanks!", `Your ${KINDS[kind].label.toLowerCase()} was sent to the developer.`));
});
