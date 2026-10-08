require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType, PermissionFlagsBits } = require("discord.js");

const { syncChannels } = require("../src/services/sync/syncChannels");
const { missingIn, noticeChannel, postingProblems } = require("../src/services/permissions/botAccess");
const { buildBlockedPostsNotice } = require("../src/ui/permissionNoticeViews");
const { buildServerNotificationsPanel } = require("../src/ui/settingsViews");
const { threadsPanel } = require("../src/services/boards/threadSettings");

const { ViewChannel, SendMessages, SendMessagesInThreads, CreatePublicThreads } = PermissionFlagsBits;
const POST = [ViewChannel, SendMessages];

/** A server whose channels grant the bot exactly the permissions listed for each. */
function fakeGuild({ publicUpdates = [], system = POST } = {}) {
    const me = { id: "bot" };
    const sent = [];
    const channel = (id, name, granted, type = ChannelType.GuildText) => ({
        id,
        name,
        type,
        rawPosition: Number(id),
        parent: null,
        isThread: () => false,
        permissionsFor: (member) => ({
            has: (flags) => member === me && [flags].flat().every((flag) => granted.includes(flag)),
        }),
        send: async (payload) => sent.push({ to: id, payload }),
    });
    const channels = [
        channel("1", "updates", [ViewChannel]),
        channel("2", "general", system),
        channel("3", "mod-updates", publicUpdates),
        channel("4", "board", POST),
    ];
    const guild = {
        id: "999",
        members: { me },
        channels: { cache: new Map(channels.map((entry) => [entry.id, entry])) },
        publicUpdatesChannel: channels[2],
        systemChannel: channels[1],
        sent,
    };
    guild.client = { guilds: { cache: new Map([["999", guild]]) } };
    return guild;
}

const textOf = (payload) => JSON.stringify(payload.components.map((component) => component.toJSON()));

test("what the bot lacks in a channel is named the way Discord names it", () => {
    const guild = fakeGuild();
    assert.deepEqual(missingIn(guild, "1", [ViewChannel, SendMessages]), ["Send Messages"]);
    assert.deepEqual(missingIn(guild, "1", [ViewChannel, SendMessagesInThreads, CreatePublicThreads]),
        ["Send Messages in Threads", "Create Public Threads"]);
    assert.equal(missingIn(guild, "unknown", POST), null, "a channel Discord has not told the bot about: cannot tell");
    assert.deepEqual([...postingProblems(guild, ["1", "4", null, "1"])], [["1", ["Send Messages"]]],
        "only channels it cannot post in, once each");
});

test("server managers are told in the updates channel, else the system channel, where the bot can post", () => {
    assert.equal(noticeChannel(fakeGuild({ publicUpdates: POST })).id, "3");
    assert.equal(noticeChannel(fakeGuild()).id, "2", "the updates channel is no use without permission to post there");
    assert.equal(noticeChannel(fakeGuild({ system: [] })), null);
});

test("after a channel sync, what stopped working is told once, naming the channel and what is missing", async () => {
    const guild = fakeGuild();
    const originalFetch = global.fetch;
    const lost = [
        { channelId: "1", name: "updates", deleted: false, posting: true, threads: true, feeds: [[], ["Design"]],
            audit: false, threadBoards: ["Sprint"], postBoards: [] },
        { channelId: "9", name: "old-log", deleted: true, posting: true, threads: false, feeds: [], audit: true,
            threadBoards: [], postBoards: ["Roadmap"] },
    ];
    let body;
    global.fetch = async (url, init) => {
        body = JSON.parse(init.body);
        return new Response(JSON.stringify({ lost }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
        await syncChannels(guild);
    } finally {
        global.fetch = originalFetch;
    }
    assert.equal(body.find((channel) => channel.channelId === "1").botCanPost, false);
    assert.equal(guild.sent.length, 1);
    assert.equal(guild.sent[0].to, "2", "in the system channel, as the updates channel is closed to the bot");
    assert.deepEqual(guild.sent[0].payload.allowedMentions, { parse: [] });
    const text = textOf(guild.sent[0].payload);
    for (const line of [
        "Some KanbanCord updates have stopped",
        "<#1>: I'm missing Send Messages, Send Messages in Threads, Create Public Threads and Create Private Threads there.",
        "- The update feed for every board can't post there.",
        "- The update feed for **Design** can't post there.",
        "- Tasks on **Sprint** can't get threads there.",
        "**#old-log** was deleted.",
        "- The audit log can't be posted there.",
        "- The board post of **Roadmap** there can't be kept up to date.",
    ]) {
        assert.ok(text.includes(line), `missing: ${line}\n${text}`);
    }
});

test("nothing lost, nothing said", async () => {
    const guild = fakeGuild();
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ lost: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    try {
        await syncChannels(guild);
    } finally {
        global.fetch = originalFetch;
    }
    assert.deepEqual(guild.sent, []);
});

test("a board post that can no longer be updated is explained", () => {
    const text = textOf(buildBlockedPostsNotice([
        { channelId: "44", boardName: "Sprint", missing: ["View Channel"] },
        { channelId: "45", boardName: "Roadmap", missing: null },
    ]));
    assert.ok(text.includes("The post of **Sprint** in <#44>: I can no longer update it (I'm missing View Channel)."));
    assert.ok(text.includes("The post of **Roadmap** in <#45>: I can no longer update it."));
});

test("the settings say which feeds and audit channel the bot cannot post in, and what it lacks", () => {
    const settings = {
        auditChannelId: "1",
        channels: [{ channelId: "1", name: "updates" }, { channelId: "4", name: "board" }],
        catalogue: [],
        feeds: [
            { feedId: 1, channelId: "1", boardIds: [], events: {}, mentions: {} },
            { feedId: 2, channelId: "4", boardIds: [], events: {}, mentions: {} },
        ],
    };
    const text = textOf({ components: [buildServerNotificationsPanel({ settings, boards: [], problems: new Map([["1", ["Send Messages"]]]) })] });
    assert.equal(text.split("⚠️ **Not posting:** I'm missing Send Messages in <#1>.").length - 1, 2, "the audit channel and the feed there");
    assert.ok(!text.includes("<#4>."), "a channel the bot can post in has no warning");

    const panel = threadsPanel({ name: "Sprint" },
        { enabled: true, active: true, channelId: "1", privateThreads: true, updates: "BOTH", channels: [{ channelId: "1" }] },
        null, ["Create Private Threads"]);
    assert.ok(textOf({ components: [panel] }).includes("⚠️ **No new threads:** I'm missing Create Private Threads in <#1>."));
});
