const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { replaceChannels } = require("../../api/syncApi");
const { buildLostChannelsNotice } = require("../../ui/permissionNoticeViews");
const logger = require("../../utils/logger");
const { Flags, missingIn, tellServer } = require("../permissions/botAccess");

/**
 * Tells KanbanCord which text channels a server has, and whether the bot may post in each, so the
 * website can offer them by name for notifications. Sent as the complete list; a burst of channel
 * or permission changes is sent once, after it settles.
 */

const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const SETTLE_MS = 3_000;
const pending = new Map();

/** @param {import("discord.js").Guild} guild */
function channelList(guild) {
    const me = guild.members.me;
    return [...guild.channels.cache.values()]
        .filter((channel) => POSTABLE.includes(channel.type))
        .map((channel) => ({
            channel,
            // Channels are listed as Discord shows them: by category, then by position within it.
            order: (channel.parent?.rawPosition ?? -1) * 10_000 + channel.rawPosition,
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ channel }, index) => ({
            channelId: channel.id,
            name: channel.name,
            category: channel.parent?.name ?? null,
            position: index,
            botCanPost: Boolean(me && channel.permissionsFor(me)?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
            ])),
            // For a thread per task: public threads, and private ones (only in text channels).
            botCanThread: Boolean(me && channel.permissionsFor(me)?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.CreatePublicThreads,
            ])),
            botCanPrivateThread: Boolean(me && channel.type === ChannelType.GuildText && channel.permissionsFor(me)?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessagesInThreads,
                PermissionFlagsBits.CreatePrivateThreads,
            ])),
        }));
}

/**
 * What the bot lacks in a channel where something stopped working: what posting needs, and what
 * threads need where they stopped (private ones only in a text channel).
 */
function missingForLost(guild, entry) {
    return missingIn(guild, entry.channelId, (channel) => {
        const needs = new Set();
        if (entry.posting) {
            needs.add(Flags.ViewChannel).add(Flags.SendMessages);
        }
        if (entry.threads) {
            needs.add(Flags.ViewChannel).add(Flags.SendMessagesInThreads).add(Flags.CreatePublicThreads);
            if (channel.type === ChannelType.GuildText) {
                needs.add(Flags.CreatePrivateThreads);
            }
        }
        return [...needs];
    });
}

/**
 * Sends the server's channels now. KanbanCord answers with what stopped working because of the change
 * (the bot lost access to a channel a feed, the audit log, task threads or a board post uses, or the
 * channel was deleted); the server's managers are told, once, in its updates or system channel.
 */
async function syncChannels(guild) {
    const channels = channelList(guild);
    const answer = await replaceChannels({ serverId: guild.id, channels });
    const lost = Array.isArray(answer?.lost) ? answer.lost : [];
    if (lost.length > 0) {
        const told = await tellServer(guild.client, guild.id, buildLostChannelsNotice(lost, (entry) => missingForLost(guild, entry)))
            .catch((error) => {
                logger.warn(`[ChannelSync] Could not tell ${guild.id} what stopped working: ${error.message}`);
                return false;
            });
        logger.info(`[ChannelSync] ${lost.length} channel(s) stopped working in ${guild.id}${told ? ", told the server" : ", nowhere to tell"}`);
    }
    return channels.length;
}

/** Sends the server's channels once changes have settled; for events that come in bursts. */
function scheduleChannelSync(guild) {
    clearTimeout(pending.get(guild.id));
    pending.set(guild.id, setTimeout(() => {
        pending.delete(guild.id);
        syncChannels(guild).catch((error) =>
            logger.error(`[ChannelSync] Failed for ${guild.id}: ${error.message}`));
    }, SETTLE_MS));
}

module.exports = { channelList, syncChannels, scheduleChannelSync, missingForLost };
