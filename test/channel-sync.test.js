require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { channelList } = require("../src/services/sync/syncChannels");

function fakeGuild() {
    const me = { id: "bot" };
    const category = (name, rawPosition) => ({ name, rawPosition });
    const staff = category("Staff", 1);
    const general = category("General", 0);
    const channel = (id, name, type, rawPosition, parent, canPost) => ({
        id,
        name,
        type,
        rawPosition,
        parent,
        permissionsFor: (member) => ({
            has: (flags) => member === me && canPost
                && flags.includes(PermissionFlagsBits.ViewChannel) && flags.includes(PermissionFlagsBits.SendMessages),
        }),
    });
    const channels = [
        channel("3", "audit-log", ChannelType.GuildText, 0, staff, true),
        channel("1", "general", ChannelType.GuildText, 0, general, true),
        channel("2", "announcements", ChannelType.GuildAnnouncement, 1, general, false),
        channel("4", "Voice", ChannelType.GuildVoice, 2, general, true),
        channel("5", "ideas", ChannelType.GuildForum, 3, general, true),
    ];
    return { id: "999", members: { me }, channels: { cache: new Map(channels.map((c) => [c.id, c])) } };
}

test("lists text and announcement channels in Discord's order, with whether the bot may post", () => {
    assert.deepEqual(channelList(fakeGuild()), [
        { channelId: "1", name: "general", category: "General", position: 0, botCanPost: true },
        { channelId: "2", name: "announcements", category: "General", position: 1, botCanPost: false },
        { channelId: "3", name: "audit-log", category: "Staff", position: 2, botCanPost: true },
    ]);
});
