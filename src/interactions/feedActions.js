const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const { postSnapshot } = require("../api/boardPostApi");
const { getSnapshot, snapshotModel } = require("../services/boards/boardData");
const actions = require("../services/boards/taskActions");
const { taskViewById } = require("../services/boards/viewService");
const { infoContainer, v2Payload, warningContainer } = require("../ui/containers");
const { buildFeedCard } = require("../ui/feedViews");
const panels = require("../ui/taskPanels");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * The controls on an interactive feed post's task card. Changes are made as whoever uses them, with
 * their permissions; the card is then redrawn for everyone from the task as it is now, so clicking
 * an older post also brings it up to date. Following and the full view are personal, so they answer
 * privately and leave the post alone.
 */

/**
 * Replaces the card (the post's last container), keeping the summary of what happened above it.
 * Drawn from the whole board, as the post shows it to the channel.
 */
async function redrawCard(ctx, boardId, taskId) {
    const message = ctx.interaction.message;
    const model = snapshotModel(await postSnapshot(ctx.guildId, boardId));
    const task = model.task(Number(taskId));
    const above = message.components.slice(0, -1).map((component) => component.toJSON());
    const card = task
        ? buildFeedCard(model, task)
        : warningContainer("Task deleted", "This task has been deleted since this was posted.");
    await ctx.update([...above, card]);
}

/** A change that could only partly be made (someone could not be assigned, say), told privately. */
async function tellIfRefused(ctx, result) {
    if (result?.notice?.startsWith("Some changes")) {
        await ctx.interaction.followUp(v2Payload(warningContainer(null, result.notice), { ephemeral: true }));
    }
}

registerComponentHandler("feed", async (ctx, { action, args }) => {
    const [boardId, taskId, columnId] = args;
    const values = ctx.interaction.values ?? [];

    switch (action) {
        case "move":
        case "moveto":
            await ctx.deferUpdate();
            await actions.moveTask(ctx, boardId, taskId, action === "move" ? columnId : values[0]);
            return redrawCard(ctx, boardId, taskId);
        case "assign": {
            await ctx.deferUpdate();
            const users = [...(ctx.interaction.users?.keys() ?? [])];
            const roles = [...(ctx.interaction.roles?.keys() ?? [])];
            const people = await actions.setAssignees(ctx, boardId, taskId, users);
            const teams = await actions.setRoles(ctx, boardId, taskId, roles);
            await redrawCard(ctx, boardId, taskId);
            await tellIfRefused(ctx, people);
            return tellIfRefused(ctx, teams);
        }
        case "edit": {
            // Forms must open within three seconds, so a copy of the board a few seconds old will do.
            const task = actions.requireTask(snapshotModel(await getSnapshot(ctx, boardId)), taskId);
            return ctx.showModal(panels.editTaskModal(boardId, task, "feed"));
        }
        case "follow": {
            await ctx.defer({ ephemeral: true });
            const model = snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
            const task = actions.requireTask(model, taskId);
            const result = await actions.setFollowing(ctx, boardId, taskId, !model.isFollowing(task));
            return ctx.reply(infoContainer(null, `${result.notice}.`));
        }
        case "more":
            await ctx.defer({ ephemeral: true });
            return ctx.reply(await taskViewById(ctx, boardId, taskId));
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});

registerModalHandler("feed", async (ctx, { action, args }) => {
    const [boardId, taskId] = args;
    if (action !== "edit") {
        throw new UserFacingError("Not available", "That form is not available here.");
    }
    const fields = ctx.interaction.fields;
    // A description too long for the form was left out of it, and is kept as it is.
    let description;
    try {
        description = fields.getTextInputValue("description");
    } catch {
        description = undefined;
    }
    await ctx.deferUpdate();
    await actions.editTask(ctx, boardId, taskId, { title: fields.getTextInputValue("title"), description });
    return redrawCard(ctx, boardId, taskId);
});
