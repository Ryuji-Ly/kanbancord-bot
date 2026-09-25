const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { encode } = require("../utils/customId");
const { describeMarkdown, discordTime, fitLines, parseServerTime, plain } = require("../utils/format");
const { appendText, buildContainer } = require("./containers");

const COMMENT_PAGE_SIZE = 5;

function authorOf(comment) {
    return plain(comment.authorGlobalName || comment.authorUsername || "Someone", 60);
}

/**
 * A page of a task's comments, newest first.
 *
 * @param {{ board: any, task: any, comments: any[], page: number, pages: number, total: number }} view
 */
function buildCommentPage({ board, task, comments, page, pages, total }) {
    const container = buildContainer({ title: `Comments on ${plain(task.title, 150)}` });
    appendText(container, `-# ${total} comment${total === 1 ? "" : "s"}${pages > 1 ? ` · page ${page + 1} of ${pages}` : ""}`);

    if (comments.length === 0) {
        appendText(container, "No comments yet.");
    } else {
        const blocks = comments.map((comment) => {
            const at = parseServerTime(comment.createdAt);
            const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt ? " · edited" : "";
            const { text, media } = describeMarkdown(comment.content, 600);
            const attachments = media.length > 0 ? `\n-# ${media.length} image${media.length === 1 ? "" : "s"} or video${media.length === 1 ? "" : "s"}; open on the website to see ${media.length === 1 ? "it" : "them"}` : "";
            return `**${authorOf(comment)}**${at ? ` · ${discordTime(at, "R")}` : ""}${edited}\n${text || "*(no text)*"}${attachments}`;
        });
        appendText(container, fitLines(blocks, 3400).shown.join("\n\n"));
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encode("comment", "page", board.boardId, task.taskId, page - 1))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Newer")
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(encode("comment", "page", board.boardId, task.taskId, page + 1))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Older")
            .setDisabled(page >= pages - 1),
        new ButtonBuilder()
            .setCustomId(encode("task", "show", board.boardId, task.taskId))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Back to task"),
    ));
    return container;
}

module.exports = { COMMENT_PAGE_SIZE, buildCommentPage };
