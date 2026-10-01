const { ChannelType, ThreadAutoArchiveDuration } = require("discord.js");
const { postSnapshot } = require("../api/boardPostApi");
const { reportThread } = require("../api/notificationApi");
const { snapshotModel } = require("../services/boards/boardData");
const { componentCount } = require("../ui/containers");
const { buildFeedCard } = require("../ui/feedViews");
const { buildAuditMessage, buildDirectMessage, buildFeedMessage } = require("../ui/notificationViews");
const { channelVisibility, serverName } = require("../services/notifications/visibility");
const logger = require("../utils/logger");
const { deliverWithThread } = require("./taskThreads");

/**
 * Delivers one plan: posts to its channels first, then sends direct messages. Someone whose direct
 * messages are "only if not already mentioned" gets none if a post just mentioned them (or a role
 * they have) in a channel they can see.
 */

/**
 * Discord refusals that trying again will not fix: the channel is gone, the bot may not post there,
 * or the person does not accept direct messages. Anything else (Discord unreachable, say) might
 * work later.
 */
const PERMANENT_CODES = new Set([
    10003, // Unknown channel
    10013, // Unknown user
    50001, // Missing access
    50007, // Cannot send messages to this user
    50013, // Missing permissions
]);

function isPermanent(error) {
    return PERMANENT_CODES.has(error?.code) || (error?.status >= 400 && error?.status < 500 && error?.status !== 429);
}

/** The Discord calls delivery needs; replaced in tests. */
function discordSenders(client) {
    return {
        sendToChannel: async (channelId, payload) => {
            const channel = await client.channels.fetch(channelId);
            if (!channel?.isSendable?.()) {
                throw Object.assign(new Error("Not a channel the bot can post in"), { code: 50013 });
            }
            return channel.send(payload);
        },
        /** A public thread on a post the bot just made. */
        startThread: (message, name) => message.startThread({ name, autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek }),
        /** A thread on its own; a private one can only be joined by those the bot adds. */
        createThread: async (channelId, { name, privateThread }) => {
            const channel = await client.channels.fetch(channelId);
            return channel.threads.create({
                name,
                type: privateThread ? ChannelType.PrivateThread : ChannelType.PublicThread,
                invitable: privateThread ? false : undefined,
                autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            });
        },
        addThreadMembers: async (threadId, userIds) => {
            const thread = await client.channels.fetch(threadId);
            for (const userId of userIds) {
                // Someone who cannot see the channel cannot be added; the others still are.
                await thread.members.add(userId).catch((error) =>
                    logger.warn(`[Threads] Could not add ${userId} to thread ${threadId}: ${error.message}`));
            }
        },
        updateThread: async (threadId, { name, close, members }) => {
            const thread = await client.channels.fetch(threadId);
            if (members.length > 0) {
                for (const userId of members) {
                    await thread.members.add(userId).catch(() => {});
                }
            }
            if (name && thread.name !== name) {
                await thread.setName(name);
            }
            if (close && !thread.archived) {
                await thread.setArchived(true);
            }
        },
        /** What a thread of its own starts with: the task, as on an interactive feed post. */
        threadIntro: async (plan) => {
            const card = await cardLoader(plan, { loadBoard: (serverId, boardId) => postSnapshot(serverId, boardId).then(snapshotModel) })();
            return buildFeedMessage(plan, introDelivery(plan), card);
        },
        reportThread,
        sendToUser: async (userId, payload) => {
            const user = await client.users.fetch(userId);
            await user.send(payload);
        },
        visibility: (guildId, channelId, userId) => channelVisibility(client, guildId, channelId, userId),
        /** The whole board, as everyone in a channel sees it on an interactive post. */
        loadBoard: (serverId, boardId) => postSnapshot(serverId, boardId).then(snapshotModel),
        serverName: (guildId) => serverName(client, guildId),
    };
}

/** The whole plan as one post without mentions: how a thread of its own starts. */
function introDelivery(plan) {
    return {
        channelId: plan.thread.channelId,
        kind: "FEED",
        entryIds: plan.entries.map((entry) => entry.logId),
        mentionUserIds: [],
        mentionRoleIds: [],
        interactive: true,
    };
}

/** Discord's limit on components in one message. */
const COMPONENTS_MAX = 40;

/**
 * The task card for interactive feed posts, made once per plan however many channels want it. Null
 * when there is none to show (the task is gone), and when it cannot be made: the post then goes out
 * plain rather than not at all.
 */
function cardLoader(plan, senders) {
    let card;
    return async () => {
        if (card !== undefined) {
            return card;
        }
        card = null;
        if (!plan.board || !plan.task || plan.task.deleted || !senders.loadBoard) {
            return card;
        }
        try {
            const model = await senders.loadBoard(plan.serverId, plan.board.boardId);
            const task = model.task(Number(plan.task.taskId));
            const built = task ? buildFeedCard(model, task) : null;
            // The summary above it takes a few components too; a card with a large gallery may not fit.
            card = built && componentCount([built]) <= COMPONENTS_MAX - 8 ? built : null;
        } catch (error) {
            logger.warn(`[Delivery] No task card for batch ${plan.batchId}: ${error.message}`);
        }
        return card;
    };
}

/**
 * @returns {Promise<{ sent: number, skipped: number, retry: boolean }>} `retry` when nothing was
 *   sent and something failed in a way that might work later; the plan should then be tried again
 */
async function deliverPlan(plan, senders) {
    let sent = 0;
    let skipped = 0;
    let transientFailure = false;

    async function attempt(what, send) {
        try {
            await send();
            sent++;
            return true;
        } catch (error) {
            if (isPermanent(error)) {
                logger.warn(`[Delivery] ${what}: ${error.message}`);
                skipped++;
            } else {
                logger.error(`[Delivery] ${what}: ${error.stack ?? error.message}`);
                transientFailure = true;
            }
            return false;
        }
    }

    // Channels first: whether a direct message is needed depends on who these mentioned.
    const reached = [];
    const cards = cardLoader(plan, senders);
    // The task's thread, for a board with threads: its channel's post goes with it.
    const thread = plan.thread && plan.task ? plan.thread : null;
    let threadDone = false;
    for (const delivery of plan.channels) {
        const payload = delivery.kind === "AUDIT"
            ? buildAuditMessage(plan, delivery)
            : buildFeedMessage(plan, delivery, delivery.interactive ? await cards() : null);
        if (thread && delivery.kind === "FEED" && delivery.channelId === thread.channelId) {
            threadDone = true;
            reached.push(...await deliverWithThread(plan, delivery, payload, senders, attempt));
            continue;
        }
        const ok = await attempt(`channel ${delivery.channelId} (batch ${plan.batchId})`,
            () => senders.sendToChannel(delivery.channelId, payload));
        if (ok && delivery.kind !== "AUDIT") {
            reached.push(delivery);
        }
    }
    if (thread && !threadDone) {
        await deliverWithThread(plan, null, null, senders, attempt);
    }

    const name = plan.directMessages.length > 0 ? await senders.serverName(plan.serverId).catch(() => null) : null;
    for (const message of plan.directMessages) {
        if (message.mode === "UNLESS_PINGED" && await alreadyMentioned(plan, message.userId, reached, senders)) {
            skipped++;
            continue;
        }
        await attempt(`direct message to ${message.userId} (batch ${plan.batchId})`,
            () => senders.sendToUser(message.userId, buildDirectMessage(plan, message, name)));
    }

    return { sent, skipped, retry: sent === 0 && transientFailure };
}

/** Whether a post just mentioned this person, or a role of theirs, in a channel they can see. */
async function alreadyMentioned(plan, userId, reached, senders) {
    for (const delivery of reached) {
        const named = delivery.mentionUserIds.includes(userId);
        if (!named && delivery.mentionRoleIds.length === 0) {
            continue;
        }
        const seen = await senders.visibility(plan.serverId, delivery.channelId, userId)
            .catch(() => ({ canSee: false, roleIds: [] }));
        if (seen.canSee && (named || delivery.mentionRoleIds.some((roleId) => seen.roleIds.includes(roleId)))) {
            return true;
        }
    }
    return false;
}

module.exports = { deliverPlan, discordSenders, isPermanent };
