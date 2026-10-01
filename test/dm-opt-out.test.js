require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags, MessageFlagsBitField } = require("discord.js");

require("../src/interactions/notificationSettings");
const { route } = require("../src/utils/interactionRouter");
const { InteractionContext } = require("../src/utils/interactionContext");

/** A click in a direct message: no server, and the message is the bot's own. */
function dmClick(customId, { onAnswer = false } = {}) {
    const calls = [];
    const interaction = {
        customId,
        user: { id: "555" },
        guildId: null,
        client: { guilds: { cache: new Map([["999", { name: "Test Server" }]]) } },
        message: { flags: new MessageFlagsBitField(onAnswer ? MessageFlags.Ephemeral : 0) },
        deferred: false,
        replied: false,
        isModalSubmit: () => false,
        async deferUpdate() {
            this.deferred = true;
            calls.push({ type: "deferUpdate" });
        },
        async deferReply(options) {
            this.deferred = true;
            calls.push({ type: "deferReply", options });
        },
        async editReply(payload) {
            calls.push({ type: "editReply", payload });
        },
    };
    return { interaction, calls };
}

/** The API as it answers /api/me/notifications, keeping what was saved. */
function fakeApi(start) {
    const state = structuredClone(start);
    const requests = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        requests.push({ url: String(url), method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
        if (init.method === "PUT") {
            const changes = JSON.parse(init.body);
            if (changes.dmMode) state.dmMode = changes.dmMode;
            Object.assign(state.servers, changes.servers ?? {});
        }
        return new Response(JSON.stringify(state), { status: 200, headers: { "content-type": "application/json" } });
    };
    return { requests, restore: () => { global.fetch = originalFetch; } };
}

async function click(customId, options) {
    const { interaction, calls } = dmClick(customId, options);
    const { handler, id } = route(interaction);
    await handler(new InteractionContext(interaction), id);
    return calls;
}

test("the button on a direct message stops that server's messages, as that person, with a way back", async () => {
    const api = fakeApi({ dmMode: "UNLESS_PINGED", servers: { 999: "ASSIGNMENTS" } });
    try {
        const calls = await click("kc1:dm:server:999:NONE");
        assert.equal(calls[0].type, "deferReply");
        assert.equal(calls[0].options.flags, MessageFlags.Ephemeral, "only the person sees the answer");
        const put = api.requests.find((request) => request.method === "PUT");
        assert.equal(put.url, "http://localhost:8080/api/me/notifications");
        assert.equal(put.headers["X-Acting-User-Id"], "555");
        assert.equal(put.headers["X-Acting-Guild-Id"], "999");
        assert.deepEqual(put.body, { servers: { 999: "NONE" } });

        const answer = JSON.stringify(calls.at(-1).payload.components[0].toJSON());
        assert.ok(answer.includes("You won't get direct messages about **Test Server** any more"), answer);
        assert.ok(answer.includes("kc1:dm:server:999:ASSIGNMENTS"), "undo puts back what it was");
        assert.ok(answer.includes("kc1:dm:all:999:NEVER"));
    } finally {
        api.restore();
    }
});

test("from the answer, every direct message can be stopped, and that answer changes in place", async () => {
    const api = fakeApi({ dmMode: "ALWAYS", servers: { 999: "NONE" } });
    try {
        const calls = await click("kc1:dm:all:999:NEVER", { onAnswer: true });
        assert.equal(calls[0].type, "deferUpdate");
        assert.deepEqual(api.requests.find((request) => request.method === "PUT").body, { dmMode: "NEVER" });
        const answer = JSON.stringify(calls.at(-1).payload.components[0].toJSON());
        assert.ok(answer.includes("Direct messages are off for every server"));
        assert.ok(answer.includes("kc1:dm:all:999:ALWAYS") && !answer.includes("kc1:dm:all:999:NEVER"));
    } finally {
        api.restore();
    }
});

test("a made-up setting is refused before anything is saved", async () => {
    const api = fakeApi({ dmMode: "ALWAYS", servers: {} });
    try {
        await assert.rejects(click("kc1:dm:server:999:EVERYTHING"), /not available/i);
        assert.equal(api.requests.length, 0);
    } finally {
        api.restore();
    }
});
