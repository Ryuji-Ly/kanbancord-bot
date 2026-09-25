const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const { getSnapshot, snapshotModel } = require("../services/boards/boardData");
const actions = require("../services/boards/taskActions");
const { columnView, taskViewById } = require("../services/boards/viewService");
const panels = require("../ui/taskPanels");
const { parseDue } = require("../utils/dueDate");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * Changing a task from its view: the actions menu, the panels it opens, and the forms. Every change
 * is made as whoever uses the control; the result replaces the view (or, for someone other than
 * the person it was made for, arrives as their own private copy).
 */

const PANELS = {
    move: panels.movePanel,
    people: panels.peoplePanel,
    roles: panels.rolesPanel,
    labels: panels.labelsPanel,
    priority: panels.priorityPanel,
    delete: panels.deletePanel,
};

/** Forms must open within three seconds, so they use the copy of the board the view just loaded. */
async function cachedTask(ctx, boardId, taskId) {
    const model = snapshotModel(await getSnapshot(ctx, boardId));
    return actions.requireTask(model, taskId);
}

async function showResult(ctx, boardId, result) {
    await ctx.update(await taskViewById(ctx, boardId, result.taskId, result.notice));
}

registerComponentHandler("act", async (ctx, { action, args }) => {
    const [boardId, taskId] = args;
    const values = ctx.interaction.values ?? [];

    if (action === "menu") {
        const choice = values[0];
        if (choice === "edit") {
            return ctx.showModal(panels.editTaskModal(boardId, await cachedTask(ctx, boardId, taskId)));
        }
        if (choice === "due") {
            return ctx.showModal(panels.dueModal(boardId, await cachedTask(ctx, boardId, taskId)));
        }
        if (choice === "comment") {
            return ctx.showModal(panels.commentModal(boardId, taskId));
        }
        await ctx.deferUpdate();
        const model = await actions.currentModel(ctx, boardId);
        const task = actions.requireTask(model, taskId);
        if (choice === "assignme" || choice === "unassignme") {
            const others = model.assigneesOf(task).filter((id) => id !== ctx.user.id);
            const wanted = choice === "assignme" ? [...others, ctx.user.id] : others;
            return showResult(ctx, boardId, await actions.setAssignees(ctx, boardId, taskId, wanted));
        }
        const build = PANELS[choice];
        if (!build) {
            throw new UserFacingError("Not available", "That action is not available here.");
        }
        return ctx.update(build(model, task));
    }

    await ctx.deferUpdate();
    switch (action) {
        case "move":
            return showResult(ctx, boardId, await actions.moveTask(ctx, boardId, taskId, values[0]));
        case "people":
            return showResult(ctx, boardId, await actions.setAssignees(ctx, boardId, taskId, values));
        case "roles":
            return showResult(ctx, boardId, await actions.setRoles(ctx, boardId, taskId, values));
        case "labels":
            return showResult(ctx, boardId, await actions.setLabels(ctx, boardId, taskId, values));
        case "priority":
            return showResult(ctx, boardId, await actions.setPriority(ctx, boardId, taskId, values[0] === "none" ? null : values[0]));
        case "delete": {
            const result = await actions.deleteTask(ctx, boardId, taskId);
            return ctx.update(await columnView(ctx, boardId, result.columnId, 0, result.notice));
        }
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});

/** A form field that may have been left out of the form (see editTaskModal). */
function optionalField(ctx, id) {
    try {
        return ctx.interaction.fields.getTextInputValue(id);
    } catch {
        return undefined;
    }
}

registerModalHandler("act", async (ctx, { action, args }) => {
    const [boardId, id] = args;
    const fields = ctx.interaction.fields;

    if (action === "due") {
        // Read before acknowledging, so a date that cannot be read is reported on its own.
        const due = parseDue(fields.getTextInputValue("due"));
        await ctx.deferUpdate();
        return showResult(ctx, boardId, await actions.setDue(ctx, boardId, id, due));
    }

    await ctx.deferUpdate();
    switch (action) {
        case "edit":
            return showResult(ctx, boardId, await actions.editTask(ctx, boardId, id, {
                title: fields.getTextInputValue("title"),
                description: optionalField(ctx, "description"),
            }));
        case "comment":
            return showResult(ctx, boardId, await actions.addComment(ctx, boardId, id, fields.getTextInputValue("content")));
        case "create":
            return showResult(ctx, boardId, await actions.createTask(ctx, boardId, id, {
                title: fields.getTextInputValue("title"),
                description: optionalField(ctx, "description"),
            }));
        default:
            throw new UserFacingError("Not available", "That form is not available here.");
    }
});
