require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection } = require("discord.js");

const { snapshotFixture } = require("./fixtures");
require("../src/interactions/taskActions");
const interactionCreate = require("../src/events/interactionCreate");

/** A menu choice on a message the same user created. */
function fakeSelect(customId, values, replies) {
    return {
        customId,
        values,
        user: { id: "555" },
        guildId: "999",
        message: { interactionMetadata: { user: { id: "555" } } },
        deferred: false,
        replied: false,
        client: { commands: new Collection() },
        isAutocomplete: () => false,
        isChatInputCommand: () => false,
        isMessageComponent: () => true,
        isModalSubmit: () => false,
        isRepliable: () => true,
        async deferUpdate() {
            this.deferred = true;
            replies.push({ type: "deferUpdate" });
        },
        async editReply(payload) {
            replies.push({ type: "editReply", payload });
        },
        async followUp(payload) {
            replies.push({ type: "followUp", payload });
        },
    };
}

test("choosing Move, then a column, moves the task and shows it with a confirmation", async () => {
    const requests = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        requests.push({ method: init.method, url: String(url), body: init.body });
        const body = String(url).includes("/snapshot") ? snapshotFixture() : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    const replies = [];
    try {
        await interactionCreate.execute(fakeSelect("kc1:act:menu:1:100", ["move"], replies));
        const panel = JSON.stringify(replies.at(-1).payload.components[0].toJSON());
        assert.ok(panel.includes("Move to") && panel.includes("kc1:act:move:1:100"), panel);
        assert.ok(!panel.includes("\"value\":\"10\""), "the task's own column is not offered");

        replies.length = 0;
        await interactionCreate.execute(fakeSelect("kc1:act:move:1:100", ["12"], replies));
    } finally {
        global.fetch = originalFetch;
    }

    const move = requests.find((request) => request.method === "POST");
    assert.equal(move.url, "http://localhost:8080/api/servers/999/boards/1/tasks/100/move");
    assert.deepEqual(JSON.parse(move.body), { columnId: 12, index: 0 });
    const [notice, view] = replies.at(-1).payload.components.map((component) => JSON.stringify(component.toJSON()));
    assert.ok(notice.includes("Moved to **Done**"), notice);
    assert.ok(view.includes("Task \\\\*0\\\\*"), "then the task itself");
});
