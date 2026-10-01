const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { encode } = require("../utils/customId");
const { plain, truncate } = require("../utils/format");
const { appendFooter, buildContainer } = require("./containers");
const { linkButton } = require("./boardViews");

/**
 * "Discuss in thread" on a task: shown only where the board's tasks can have threads (a feed covers
 * the board). A link to the task's thread when it has one; otherwise a button that makes it, or that
 * offers to switch threads on.
 */

function threadUrl(serverId, threadId) {
    return `https://discord.com/channels/${serverId}/${threadId}`;
}

/** The button for a task's view or feed post, or null where tasks cannot have threads. */
function threadButton(model, task) {
    const threads = model.threads;
    if (!threads?.available) {
        return null;
    }
    const threadId = threads.threadIds?.[String(task.taskId)];
    if (threadId) {
        return linkButton("Open thread", threadUrl(model.board.serverId, threadId));
    }
    return new ButtonBuilder()
        .setCustomId(encode("thr", "open", model.board.boardId, task.taskId))
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Discuss in thread");
}

/** The thread exists (or was just made): a link to it. */
function threadReady({ serverId, threadId, taskTitle, notice, privateFor }) {
    const container = buildContainer({
        title: `Thread for ${plain(taskTitle, 80)}`,
        body: [
            notice ?? `This task's thread is <#${threadId}>.`,
            privateFor ? `-# It is private: ${privateFor}.` : null,
        ].filter(Boolean).join("\n"),
    });
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Open thread", threadUrl(serverId, threadId))));
    return container;
}

/**
 * Threads are off for the board, and the person may switch them on: confirm, with the feed channel
 * chosen (or to choose, when the board has several).
 */
function enableThreadsPrompt({ board, taskId, channels }) {
    const usable = channels.filter((channel) => channel.botCanThread);
    const where = usable.length === 1 ? ` They go in <#${usable[0].channelId}>.` : "";
    const container = buildContainer({
        title: `Switch on task threads for ${plain(board.name, 70)}?`,
        body: "Each task on this board gets its own thread for discussion, in one of the board's feed channels: "
            + `public, started from the task's post, with updates going to both the thread and the channel.${where}`,
    });
    if (usable.length === 0) {
        return appendFooter(container, "The bot cannot make threads in any of this board's feed channels. Give it Create "
            + "Public Threads and Send Messages in Threads in one, then try again.");
    }
    if (usable.length === 1) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(encode("thr", "enable", board.boardId, taskId, usable[0].channelId))
                .setStyle(ButtonStyle.Primary)
                .setLabel("Switch on and start this thread"),
            new ButtonBuilder().setCustomId(encode("thr", "cancel")).setStyle(ButtonStyle.Secondary).setLabel("Not now"),
        ));
    } else {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("thr", "enable", board.boardId, taskId))
            .setPlaceholder("Switch on, with threads in…")
            .addOptions(usable.slice(0, 25).map((channel) => ({ label: truncate(`#${channel.name}`, 100), value: channel.channelId })))));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(encode("thr", "cancel")).setStyle(ButtonStyle.Secondary).setLabel("Not now")));
    }
    return appendFooter(container, "Change it later with /board threads: private threads, or where updates go.");
}

module.exports = { threadButton, threadReady, enableThreadsPrompt, threadUrl };
