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

test("each report has a Reply button that opens a form, for the developer only", async () => {
    const sent = [];
    const replies = [];
    // A different reporter, so the cooldown from the first test does not apply.
    const interaction = fakeModalSubmit({
        customId: "kc1:report:submit:suggestion",
        fields: { title: "Dark mode", description: "Please." },
        sent,
        replies,
    });
    interaction.user = { id: "777", username: "other", tag: "other" };
    await interactionCreate.execute(interaction);
    const text = JSON.stringify(sent[0].payload.components.map((component) => component.toJSON()));
    assert.ok(text.includes("kc1:report:reply:777:suggestion"));

    const shown = [];
    const press = (userId) => ({
        ...fakeModalSubmit({ customId: "kc1:report:reply:777:suggestion", fields: {}, sent: [], replies: shown }),
        user: { id: userId, username: "someone", tag: "someone" },
        isModalSubmit: () => false,
        isMessageComponent: () => true,
        isButton: () => true,
        showModal: async (modal) => shown.push({ type: "modal", modal: modal.toJSON() }),
    });
    await interactionCreate.execute(press("123456789012345678"));
    assert.equal(shown.at(-1).type, "modal");
    assert.equal(shown.at(-1).modal.custom_id, "kc1:report:answer:777:suggestion");

    await interactionCreate.execute(press("555"));
    assert.ok(JSON.stringify(shown.at(-1).payload.components[0].toJSON()).includes("Only the developer can reply"));
});

test("a reply reaches the reporter by DM, quoting what it answers", async () => {
    const sent = [];
    const replies = [];
    const interaction = fakeModalSubmit({
        customId: "kc1:report:answer:777:issue",
        fields: { reply: "Fixed, thanks!" },
        sent,
        replies,
    });
    interaction.user = { id: "123456789012345678", username: "dev", tag: "dev" };
    interaction.message = { components: [{ components: [{ content: "### Issue: Board won't *load*" }, { content: "Steps" }] }] };
    await interactionCreate.execute(interaction);

    assert.equal(sent.length, 1);
    assert.equal(sent[0].id, "777");
    const text = JSON.stringify(sent[0].payload.components.map((component) => component.toJSON()));
    assert.ok(text.includes("A reply to your issue report"));
    // The quoted title is escaped, so their own formatting shows as typed.
    assert.ok(text.includes(JSON.stringify("> Board won't \\*load\\*").slice(1, -1)));
    assert.ok(text.includes("Fixed, thanks!"));
    assert.deepEqual(sent[0].payload.allowedMentions, { parse: [] });
    assert.ok(JSON.stringify(replies.at(-1).payload.components[0].toJSON()).includes("Reply sent"));
});

test("a reply that cannot be delivered says why", async () => {
    const replies = [];
    const interaction = fakeModalSubmit({ customId: "kc1:report:answer:777:issue", fields: { reply: "Hi" }, sent: [], replies });
    interaction.user = { id: "123456789012345678", username: "dev", tag: "dev" };
    interaction.client.users.fetch = async (id) => ({
        id,
        username: "closed",
        send: async () => {
            throw new Error("Cannot send messages to this user");
        },
    });
    await interactionCreate.execute(interaction);
    const text = JSON.stringify(replies.at(-1).payload.components[0].toJSON());
    assert.ok(text.includes("Reply not sent"));
    assert.ok(text.includes("does not accept direct messages"));
});
