const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const {
    KINDS, buildReplyModal, claimCooldown, deliverReply, deliverReport, isDeveloper, reportTitleFrom,
} = require("../services/report/reportService");
const { successContainer } = require("../ui/containers");
const { UserFacingError } = require("../utils/errorMessages");

/** Reports and replies are between their sender and the developer; anyone else pressing Reply is told so. */
function requireDeveloper(ctx) {
    if (!isDeveloper(ctx.user.id)) {
        throw new UserFacingError("Only the developer can reply", "Replies to reports come from the KanbanCord developer.");
    }
}

/** Reply, on a report the developer received: opens the form for the answer. */
registerComponentHandler("report", async (ctx, { action, args }) => {
    if (action !== "reply") {
        return;
    }
    requireDeveloper(ctx);
    const [userId, kind] = args;
    await ctx.showModal(buildReplyModal(userId, kind));
});

registerModalHandler("report", async (ctx, { action, args }) => {
    if (action === "answer") {
        requireDeveloper(ctx);
        const [userId, kind] = args;
        await ctx.defer({ ephemeral: true });
        const user = await deliverReply(ctx.client, {
            userId,
            kind,
            about: reportTitleFrom(ctx.interaction.message),
            text: ctx.interaction.fields.getTextInputValue("reply").trim(),
        });
        await ctx.reply(successContainer("Reply sent", `Sent to ${user.username} by direct message.`));
        return;
    }
    if (action !== "submit") {
        return;
    }
    // The /report form, submitted.
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
