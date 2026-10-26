const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const { getSnapshot } = require("../services/boards/boardData");
const importer = require("../services/boards/taskImport");
const { boardViewById } = require("../services/boards/viewService");
const { plural } = require("../ui/importViews");
const { UserFacingError } = require("../utils/errorMessages");

/** The pasted list from /task import's form, and the preview's Import and Cancel buttons. */

registerModalHandler("imp", async (ctx, { action, args }) => {
    if (action !== "text") {
        throw new UserFacingError("Not available", "That form is not available here.");
    }
    const [boardId, columnId, createColumns] = args;
    await ctx.defer({ ephemeral: true });
    const { board } = await getSnapshot(ctx, boardId);
    await importer.showPreview(ctx, board, {
        text: ctx.interaction.fields.getTextInputValue("list"),
        format: "AUTO",
        defaultColumnId: Number(columnId) || null,
        createColumns: createColumns === "1",
    });
});

registerComponentHandler("imp", async (ctx, { action, args }) => {
    const [id] = args;
    const entry = importer.waitingImport(id, ctx.user.id);
    await ctx.deferUpdate();
    if (action === "no") {
        importer.forget(id);
        return ctx.update(await boardViewById(ctx, entry.boardId, "Import cancelled"));
    }
    if (action !== "go") {
        throw new UserFacingError("Not available", "That action is not available here.");
    }
    const plan = await importer.runImport(ctx, entry);
    importer.forget(id);
    const created = (plan.columns ?? []).filter((column) => column.created).length;
    const notice = `Imported ${plural(plan.tasks.length, "task")}${created > 0 ? `, with ${plural(created, "new column")}` : ""}`;
    return ctx.update(await boardViewById(ctx, entry.boardId, notice));
});
