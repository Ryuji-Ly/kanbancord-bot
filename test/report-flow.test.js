require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");

require("../src/interactions/report");
const interactionCreate = require("../src/events/interactionCreate");

/** Just enough of a modal-submit interaction for the router and context. */
function fakeModalSubmit({ customId, fields, sent, replies }) {
    return {
        customId,
        user: { id: "555", username: "tester", tag: "tester" },
        guildId: "999",
        guild: { id: "999", name: "Test Server" },
        deferred: false,
        replied: false,
        client: {
            users: {
                fetch: async (id) => ({ id, send: async (payload) => sent.push({ id, payload }) }),
            },
        },
        fields: { getTextInputValue: (name) => fields[name] },
        isAutocomplete: () => false,
        isChatInputCommand: () => false,
        isMessageComponent: () => false,
        isModalSubmit: () => true,
        isRepliable: () => true,
        async deferReply(options) {
            this.deferred = true;
            replies.push({ type: "defer", options });
        },
        async editReply(payload) {
            replies.push({ type: "edit", payload });
        },
        async reply(payload) {
            this.replied = true;
            replies.push({ type: "reply", payload });
        },
        async followUp(payload) {
            replies.push({ type: "followUp", payload });
        },
    };
}

test("a submitted report reaches the developer as a container, and pings no one", async () => {
    const sent = [];
    const replies = [];
    await interactionCreate.execute(fakeModalSubmit({
        customId: "kc1:report:submit:issue",
        fields: { title: "  Board won't load @everyone ", description: "Steps: open it." },
        sent,
        replies,
    }));

    assert.equal(sent.length, 1);
    assert.equal(sent[0].id, "123456789012345678");
    const dm = sent[0].payload;
    assert.ok(dm.flags & MessageFlags.IsComponentsV2);
    assert.deepEqual(dm.allowedMentions, { parse: [] });
    const text = JSON.stringify(dm.components.map((component) => component.toJSON()));
    assert.ok(text.includes("Issue: Board won't load @everyone"));
    assert.ok(text.includes("in Test Server (999)"));

    assert.equal(replies[0].type, "defer");
    assert.equal(replies.at(-1).type, "edit");
    assert.ok(JSON.stringify(replies.at(-1).payload.components[0].toJSON()).includes("Thanks!"));
});

test("a second report straight away is refused with a readable reason", async () => {
    const sent = [];
    const replies = [];
    await interactionCreate.execute(fakeModalSubmit({
        customId: "kc1:report:submit:suggestion",
        fields: { title: "Again", description: "Again" },
        sent,
        replies,
    }));
    assert.equal(sent.length, 0);
    const answer = replies.at(-1);
    assert.equal(answer.type, "reply");
    assert.ok(answer.payload.flags & MessageFlags.Ephemeral);
    assert.ok(JSON.stringify(answer.payload.components[0].toJSON()).includes("Slow down"));
});

test("buttons from an older version of the bot are refused politely", async () => {
    const replies = [];
    const interaction = fakeModalSubmit({ customId: "kc0:report:submit:issue", fields: {}, sent: [], replies });
    await interactionCreate.execute(interaction);
    assert.ok(JSON.stringify(replies[0].payload.components[0].toJSON()).includes("This has expired"));
});
