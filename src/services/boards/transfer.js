const { AttachmentBuilder } = require("discord.js");
const { buildExportView, buildImportView } = require("../../ui/transferViews");
const { UserFacingError } = require("../../utils/errorMessages");
const { forgetBoard, getSnapshot, resolveBoard } = require("./boardData");

/**
 * /board export and /board import: a board as a file, and a new board from one. The file is the
 * same as the website's, so either can read what the other made. The API checks every permission.
 */

/** The optional parts of a board file, with the feature each needs; each is a true/false option. */
const PARTS = [
    { name: "labels", feature: "LABELS", label: "Labels" },
    { name: "priorities", feature: "PRIORITIES", label: "Priorities" },
    { name: "assignees", feature: "ASSIGNEES", label: "Assignees" },
    { name: "comments", feature: "COMMENTS", label: "Comments" },
    { name: "permissions", feature: "PERMISSIONS", label: "Permission rules" },
];

/** Discord lets bots download files this large and more, but a board file is never close. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** A large board takes a while to create. */
const IMPORT_TIMEOUT_MS = 60_000;

/** "Sprint 12" → "Sprint 12.kanbancord.json", without characters file systems refuse. */
function fileName(boardName) {
    return `${String(boardName).replace(/[\\/:*?"<>|]+/g, " ").trim() || "board"}.kanbancord.json`;
}

/**
 * The parts to export: those the board uses, and its rules only for those who may edit them, unless
 * an option says otherwise.
 */
function exportParts(options, snapshot) {
    return PARTS.filter((part) => {
        const chosen = options.getBoolean(part.name);
        if (chosen !== null) return chosen;
        if (!snapshot.features?.[part.feature]) return false;
        return part.name !== "permissions" || Boolean(snapshot.permissions?.EDIT_BOARD_PERMISSIONS?.allowed);
    }).map((part) => part.name);
}

async function boardExport(ctx) {
    await ctx.defer({ ephemeral: true });
    const board = await resolveBoard(ctx, ctx.interaction.options.getString("board", true));
    const snapshot = await getSnapshot(ctx, board.boardId, { fresh: true });
    const parts = exportParts(ctx.interaction.options, snapshot);
    const query = new URLSearchParams();
    parts.forEach((part) => query.append("part", part));
    const file = await ctx.api.get(`/boards/${board.boardId}/export?${query}`);

    const name = fileName(board.name);
    const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(file, null, 2), "utf8"), { name });
    await ctx.reply(buildExportView({ board, file, name, parts: PARTS.filter((part) => parts.includes(part.name)) }),
        { ephemeral: true, files: [attachment] });
}

/** The optional parts the file has, as the API reads them. */
function partsInFile(file) {
    const tasks = Array.isArray(file.tasks) ? file.tasks : [];
    const has = {
        labels: Array.isArray(file.labels),
        priorities: Array.isArray(file.priorities),
        assignees: tasks.some((task) => Array.isArray(task.assignees) || Array.isArray(task.roles)),
        comments: tasks.some((task) => Array.isArray(task.comments)),
        permissions: Array.isArray(file.permissions),
    };
    return PARTS.filter((part) => has[part.name]).map((part) => part.name);
}

/** The attachment, read as a board file; anything else is refused with a reason. */
async function readBoardFile(attachment) {
    if (attachment.size > MAX_FILE_BYTES) {
        throw new UserFacingError("File too large", "A board file is at most 8 MB.");
    }
    let file;
    try {
        const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(String(response.status));
        file = JSON.parse(await response.text());
    } catch {
        file = null;
    }
    if (!file || file.format !== "kanbancord-board" || !file.board || !Array.isArray(file.columns) || !Array.isArray(file.tasks)) {
        throw new UserFacingError("Not a board file", "That file is not a board exported from KanbanCord. "
            + "Export one with `/board export` or from a board's settings on the website.");
    }
    return file;
}

async function boardImport(ctx) {
    const options = ctx.interaction.options;
    await ctx.defer({ ephemeral: true });
    const file = await readBoardFile(options.getAttachment("file", true));
    const parts = partsInFile(file).filter((part) => options.getBoolean(part) !== false);
    const name = options.getString("name") ?? file.board.name;
    const result = await ctx.api.post("/boards/import", {
        body: { document: file, parts, name },
        timeoutMs: IMPORT_TIMEOUT_MS,
    });
    forgetBoard(ctx, result.board.boardId);
    await ctx.reply(buildImportView(result), { ephemeral: true });
}

module.exports = { PARTS, boardExport, boardImport, exportParts, partsInFile };
