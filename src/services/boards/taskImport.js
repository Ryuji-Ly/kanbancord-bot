const crypto = require("node:crypto");
const { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { encode } = require("../../utils/customId");
const { UserFacingError } = require("../../utils/errorMessages");
const { importPreview } = require("../../ui/importViews");
const { forgetBoard, getSnapshot, resolveBoard, resolveColumn, snapshotModel } = require("./boardData");

/**
 * /task import: tasks from a pasted list or an attached file, added to an existing board. The API
 * reads the text and says what would happen; the person sees that privately and confirms. The text
 * waits here between the two, since a button cannot carry it.
 */

/** The API takes about half a megabyte of text; a file larger than that is refused before downloading it. */
const MAX_FILE_BYTES = 512 * 1024;
/** How long a preview can wait for its Import button. */
const PENDING_MS = 15 * 60_000;
/** The most a Discord form's text box holds. */
const FORM_TEXT_MAX = 4000;
const IMPORT_TIMEOUT_MS = 60_000;

/** @type {Map<string, { boardId: number|string, userId: string, input: object, at: number }>} */
const pending = new Map();

function remember(entry) {
    const now = Date.now();
    for (const [id, waiting] of pending) {
        if (now - waiting.at > PENDING_MS) pending.delete(id);
    }
    const id = crypto.randomBytes(6).toString("base64url");
    pending.set(id, { ...entry, at: now });
    return id;
}

/** The import waiting under this id, for the person who started it; refused for anyone else. */
function waitingImport(id, userId) {
    const entry = pending.get(id);
    if (!entry || Date.now() - entry.at > PENDING_MS) {
        pending.delete(id);
        throw new UserFacingError("Import expired", "This import is no longer waiting. Run `/task import` again.");
    }
    if (entry.userId !== userId) {
        throw new UserFacingError("Not your import", "Only the person who started this import can finish it.");
    }
    return entry;
}

function forget(id) {
    pending.delete(id);
}

/** The format a file's name suggests; anything else is worked out from its contents. */
function formatOfName(name) {
    const extension = String(name ?? "").toLowerCase().split(".").pop();
    return { csv: "CSV", tsv: "TSV", json: "KANBANCORD" }[extension] ?? "AUTO";
}

async function readText(attachment) {
    if (attachment.size > MAX_FILE_BYTES) {
        throw new UserFacingError("File too large", "A file to import tasks from is at most 512 KB.");
    }
    try {
        const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(String(response.status));
        return await response.text();
    } catch {
        throw new UserFacingError("File not read", "That file could not be downloaded. Try attaching it again.");
    }
}

/** The form for pasting a list; the board, column and whether to create columns ride in its id. */
function importModal(boardId, columnId, createColumns) {
    return new ModalBuilder()
        .setCustomId(encode("imp", "text", boardId, columnId ?? 0, createColumns ? 1 : 0))
        .setTitle("Import tasks")
        .addLabelComponents(new LabelBuilder()
            .setLabel("Tasks, one per line")
            .setDescription("Bullets, checkboxes and # headings work; ticked items go to the last column.")
            .setTextInputComponent(new TextInputBuilder()
                .setCustomId("list")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(FORM_TEXT_MAX)
                .setPlaceholder("- First task\n- [x] Already done\n# Another column\n- Second task")));
}

async function preview(ctx, boardId, input) {
    return ctx.api.post(`/boards/${boardId}/import-tasks/preview`, { body: input });
}

/** Shows the preview privately and keeps the text until Import or Cancel is pressed. */
async function showPreview(ctx, board, input) {
    const plan = await preview(ctx, board.boardId, input);
    const id = remember({ boardId: board.boardId, userId: ctx.user.id, input });
    await ctx.reply(importPreview(board, plan, id), { ephemeral: true });
}

/** Imports what was previewed; the board's cached copy is dropped so views show the new tasks. */
async function runImport(ctx, entry) {
    const plan = await ctx.api.post(`/boards/${entry.boardId}/import-tasks`, { body: entry.input, timeoutMs: IMPORT_TIMEOUT_MS });
    forgetBoard(ctx, entry.boardId);
    return plan;
}

/**
 * The command's options: with a file, its contents go straight to a preview; without one, a form
 * opens for pasting. Forms must open within three seconds, so a cached copy of the board will do.
 */
async function commandInput(ctx) {
    const options = ctx.interaction.options;
    const board = await resolveBoard(ctx, options.getString("board", true));
    const columnInput = options.getString("column");
    const column = columnInput ? resolveColumn(snapshotModel(await getSnapshot(ctx, board.boardId)), columnInput) : null;
    return {
        board,
        columnId: column ? column.columnId : null,
        createColumns: options.getBoolean("new-columns") !== false,
        file: options.getAttachment("file"),
    };
}

module.exports = {
    FORM_TEXT_MAX,
    commandInput,
    formatOfName,
    forget,
    importModal,
    preview,
    readText,
    remember,
    runImport,
    showPreview,
    waitingImport,
};
