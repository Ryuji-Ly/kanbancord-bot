require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType, PermissionsBitField, PermissionFlagsBits } = require("discord.js");

require("../src/interactions/taskThreads");
const { route } = require("../src/utils/interactionRouter");
const { InteractionContext } = require("../src/utils/interactionContext");
const { threadButton } = require("../src/ui/threadViews");
const { snapshotModel } = require("../src/services/boards/boardData");
const { snapshotFixture } = require("./fixtures");

test("the button shows only where tasks can have threads, and links to a thread that exists", () => {
    const base = snapshotFixture();
    const task = base.tasks[0];
    assert.equal(threadButton(snapshotModel(base), task), null, "no feed for the board: no button");

    const off = threadButton(snapshotModel({ ...base, threads: { available: true, enabled: false, threadIds: {} } }), task).toJSON();
    assert.equal(off.label, "Discuss in thread");
    assert.equal(off.custom_id, `kc1:thr:open:${base.board.boardId}:${task.taskId}`);

    const made = threadButton(snapshotModel({ ...base, threads: { available: true, enabled: true, threadIds: { [task.taskId]: "777" } } }), task).toJSON();
    assert.equal(made.url, `https://discord.com/channels/${base.board.serverId}/777`);
});

/** A click, with the API and Discord answering from `info`. */
async function click(customId, info, { values } = {}) {
    const calls = { api: [], discord: [], replies: [] };
    const original = global.fetch;
    global.fetch = async (url, init) => {
        const path = new URL(String(url)).pathname;
        calls.api.push(`${init.method} ${path.replace("/api/servers/999", "")}`);
        const body = path.endsWith("/thread") ? info()
            : path.endsWith("/snapshot") ? snapshotFixture()
                : path.endsWith("/boards") ? { content: [{ boardId: 1, name: "Sprint" }] } : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    const channel = {
        type: ChannelType.GuildText,
        permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]),
        isSendable: () => true,
        threads: { create: async (options) => { calls.discord.push(["create", options.name]); return { id: "888" }; } },
        send: async () => { calls.discord.push(["post"]); },
        members: { add: async (id) => calls.discord.push(["add", id]) },
    };
    const interaction = {
        customId, values, user: { id: "5" }, guildId: "999", message: {},
        client: { channels: { fetch: async () => channel } },
        guild: { channels: { cache: new Map([["50", channel]]) }, members: { me: {} } },
        deferred: false, replied: false, isModalSubmit: () => false,
        async deferReply() { this.deferred = true; },
        async deferUpdate() { this.deferred = true; },
        async editReply(payload) { calls.replies.push(JSON.stringify(payload.components[0].toJSON())); },
    };
    try {
        const { handler, id } = route(interaction);
        await handler(new InteractionContext(interaction), id);
        return calls;
    } finally {
        global.fetch = original;
    }
}

const enabled = () => ({ available: true, enabled: true, canEnable: false, threadId: null, channelId: "50",
    privateThread: false, name: "Fix login", members: [], channels: [] });

test("with threads on, the task's thread is made there and then, reported, and linked", async () => {
    const calls = await click("kc1:thr:open:1:100", enabled);
    assert.deepEqual(calls.discord.map((step) => step[0]), ["create", "post"]);
    assert.ok(calls.api.includes("POST /api/internal/notifications/threads"));
    assert.ok(calls.replies.at(-1).includes("Started this task's thread: <#888>"));
});

test("with threads off, others are told so, and the board's managers are offered to switch them on", async () => {
    const off = (canEnable) => () => ({ ...enabled(), enabled: false, canEnable,
        channels: canEnable ? [{ channelId: "50", name: "updates", botCanThread: true }] : [] });
    await assert.rejects(click("kc1:thr:open:1:100", off(false)), /Task threads are not switched on for this board/);

    const offer = await click("kc1:thr:open:1:100", off(true));
    assert.ok(offer.replies.at(-1).includes("Switch on task threads for Sprint?"));
    assert.ok(offer.replies.at(-1).includes("kc1:thr:enable:1:100:50"), "the only feed channel, chosen");

    let calls = 0;
    const flips = () => (calls++ === 0 ? off(true)() : enabled());
    const switched = await click("kc1:thr:enable:1:100:50", flips);
    assert.ok(switched.api.includes("PUT /boards/1/threads"));
    assert.ok(switched.replies.at(-1).includes("<#888>"));
});
