const { MessageFlags, PermissionFlagsBits: Flags, Routes } = require("discord.js");
const logger = require("../../utils/logger");

/**
 * What the bot may do in a channel, said the way Discord names the permissions, and telling a
 * server's managers when something it was set up to do stopped working.
 */

const NAMES = new Map([
    [Flags.ViewChannel, "View Channel"],
    [Flags.SendMessages, "Send Messages"],
    [Flags.SendMessagesInThreads, "Send Messages in Threads"],
    [Flags.CreatePublicThreads, "Create Public Threads"],
    [Flags.CreatePrivateThreads, "Create Private Threads"],
]);

/** What posting (or keeping a post up to date) needs: in a thread, sending in threads. */
function postingNeeds(channel) {
    return [Flags.ViewChannel, channel?.isThread?.() ? Flags.SendMessagesInThreads : Flags.SendMessages];
}

/** What making a task's threads needs in a channel. */
function threadNeeds(privateThreads) {
    return [Flags.ViewChannel, Flags.SendMessagesInThreads, privateThreads ? Flags.CreatePrivateThreads : Flags.CreatePublicThreads];
}

/** The names of the permissions in `needs` that `permissions` lacks. */
function missingFrom(permissions, needs) {
    return needs.filter((flag) => !permissions.has(flag)).map((flag) => NAMES.get(flag));
}

/**
 * What the bot lacks of `needs` in a channel of the server, by name: empty when it has it all, null
 * when it cannot tell (Discord has not told it about the channel).
 *
 * @param {(channel: object) => bigint[]} needs or a function of the channel, for needs that depend on it
 */
function missingIn(guild, channelId, needs) {
    const channel = guild?.channels.cache.get(channelId);
    const me = guild?.members.me;
    const permissions = channel && me ? channel.permissionsFor(me) : null;
    if (!permissions) {
        return null;
    }
    return missingFrom(permissions, typeof needs === "function" ? needs(channel) : needs);
}

/** For each channel the bot cannot post in, what it is missing there (channels it can post in are left out). */
function postingProblems(guild, channelIds) {
    const problems = new Map();
    for (const channelId of new Set(channelIds.filter(Boolean))) {
        const missing = missingIn(guild, channelId, postingNeeds);
        if (missing && missing.length > 0) {
            problems.set(channelId, missing);
        }
    }
    return problems;
}

/** "View Channel", "View Channel and Send Messages", "A, B and C". */
function listOf(names) {
    return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Where a server's managers are told: its Community updates channel, else its system channel, if the bot may post there. */
function noticeChannel(guild) {
    const me = guild.members.me;
    for (const channel of [guild.publicUpdatesChannel, guild.systemChannel]) {
        const permissions = channel && me ? channel.permissionsFor(me) : null;
        if (permissions && missingFrom(permissions, postingNeeds(channel)).length === 0) {
            return channel;
        }
    }
    return null;
}

/**
 * Tells a server's managers, in its updates or system channel. Returns whether it could. For a server
 * on another shard (board posts are kept up to date on one), it goes through Discord's API and simply
 * tries those channels.
 *
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {{ components: object[] }} payload a Components V2 message
 */
async function tellServer(client, guildId, payload) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const channel = noticeChannel(guild);
        if (!channel) {
            return false;
        }
        await channel.send(payload);
        return true;
    }
    const data = await client.rest.get(Routes.guild(guildId));
    const body = {
        components: payload.components.map((component) => component.toJSON()),
        flags: MessageFlags.IsComponentsV2,
        allowed_mentions: { parse: [] },
    };
    for (const channelId of [data.public_updates_channel_id, data.system_channel_id].filter(Boolean)) {
        try {
            await client.rest.post(Routes.channelMessages(channelId), { body });
            return true;
        } catch (error) {
            logger.warn(`[Notices] Could not tell ${guildId} in ${channelId}: ${error.message}`);
        }
    }
    return false;
}

module.exports = {
    Flags,
    NAMES,
    postingNeeds,
    threadNeeds,
    missingFrom,
    missingIn,
    postingProblems,
    listOf,
    noticeChannel,
    tellServer,
};
