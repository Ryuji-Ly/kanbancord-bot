const { buildAuditMessage, buildDirectMessage, buildFeedMessage } = require("../ui/notificationViews");
const { channelVisibility, serverName } = require("../services/notifications/visibility");
const logger = require("../utils/logger");

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
            await channel.send(payload);
        },
        sendToUser: async (userId, payload) => {
            const user = await client.users.fetch(userId);
            await user.send(payload);
        },
        visibility: (guildId, channelId, userId) => channelVisibility(client, guildId, channelId, userId),
        serverName: (guildId) => serverName(client, guildId),
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
    for (const delivery of plan.channels) {
        const payload = delivery.kind === "AUDIT" ? buildAuditMessage(plan, delivery) : buildFeedMessage(plan, delivery);
        const ok = await attempt(`channel ${delivery.channelId} (batch ${plan.batchId})`,
            () => senders.sendToChannel(delivery.channelId, payload));
        if (ok && delivery.kind !== "AUDIT") {
            reached.push(delivery);
        }
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
