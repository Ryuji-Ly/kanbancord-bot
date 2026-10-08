require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require("discord.js");

const { boardThreads } = require("../src/services/boards/threadSettings");

const ALL = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads];

/** A context as /board threads sees it, with the API answering from `state`. */
function fakeCtx(state, { channelType = ChannelType.GuildText, granted = ALL } = {}) {
    const calls = [];
    const channel = { type: channelType, permissionsFor: () => new PermissionsBitField(granted) };
    return {
        calls,
        ctx: {
            guildId: "999",
            user: { id: `u${Math.random()}` },
            interaction: { guild: { channels: { cache: new Map([["5", channel], ["6", channel]]) }, members: { me: {} } } },
            api: {
                get: async (path) => (path === "/boards" ? { content: [{ boardId: 1, name: "Sprint" }] } : state),
                put: async (path, { body }) => {
                    calls.push(["PUT", path, body]);
                    return { ...state, enabled: true, active: true, ...body };
                },
                delete: async (path) => {
                    calls.push(["DELETE", path]);
                    return { ...state, enabled: false };
                },
            },
        },
    };
}

const text = (container) => JSON.stringify(container.toJSON());
const none = { enabled: null, channelId: null, privateThreads: null, updates: null };
const offWithOneFeed = { enabled: false, active: false, channelId: null, privateThreads: false, updates: "BOTH",
    channels: [{ channelId: "5", name: "updates" }] };

test("with no options it shows the setting; switching on picks the board's only feed channel", async () => {
    const shown = fakeCtx(offWithOneFeed);
    assert.ok(text(await boardThreads(shown.ctx, "Sprint", none)).includes("**Off.**"));
    assert.equal(shown.calls.length, 0);

    const on = fakeCtx(offWithOneFeed);
    const panel = text(await boardThreads(on.ctx, "Sprint", { ...none, enabled: true }));
    assert.deepEqual(on.calls, [["PUT", "/boards/1/threads", { channelId: "5", privateThreads: false, updates: "BOTH" }]],
        "public, to the thread and the channel, by default");
    assert.ok(panel.includes("Threads are on") && panel.includes("the thread and the channel"));
});

test("options left out keep what the board has; with several feed channels one must be chosen", async () => {
    const on = { ...offWithOneFeed, enabled: true, active: true, channelId: "5", privateThreads: true, updates: "THREAD" };
    const change = fakeCtx(on);
    await boardThreads(change.ctx, "Sprint", { ...none, updates: "BOTH" });
    assert.deepEqual(change.calls[0][2], { channelId: "5", privateThreads: true, updates: "BOTH" });

    const two = fakeCtx({ ...offWithOneFeed, channels: [{ channelId: "5" }, { channelId: "6" }] });
    await assert.rejects(boardThreads(two.ctx, "Sprint", { ...none, enabled: true }), /more than one feed channel: <#5>, <#6>/);
    await assert.rejects(boardThreads(fakeCtx({ ...offWithOneFeed, channels: [] }).ctx, "Sprint", { ...none, enabled: true }),
        /Add one with `\/kanbancord feed`/);
});

test("switching off, and channels where the bot cannot make the threads asked for", async () => {
    const off = fakeCtx({ ...offWithOneFeed, enabled: true, channelId: "5" });
    assert.ok(text(await boardThreads(off.ctx, "Sprint", { ...none, enabled: false })).includes("Threads are off"));
    assert.deepEqual(off.calls, [["DELETE", "/boards/1/threads"]]);

    const news = fakeCtx(offWithOneFeed, { channelType: ChannelType.GuildAnnouncement });
    await assert.rejects(boardThreads(news.ctx, "Sprint", { ...none, enabled: true, privateThreads: true }),
        /announcement channel, which can only have public threads/);
    const noRights = fakeCtx(offWithOneFeed, { granted: [PermissionFlagsBits.ViewChannel] });
    await assert.rejects(boardThreads(noRights.ctx, "Sprint", { ...none, enabled: true }),
        /I'm missing Send Messages in Threads and Create Public Threads in <#5>/);
    assert.equal(news.calls.length + noRights.calls.length, 0, "nothing saved");
});
