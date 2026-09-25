require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const { InteractionContext } = require("../src/utils/interactionContext");
const { buildContainer } = require("../src/ui/containers");

/** A button click on a message that `ownerId` created with a command. */
function fakeClick({ clickerId, ownerId }) {
    const calls = [];
    const interaction = {
        user: { id: clickerId },
        guildId: "999",
        message: { interactionMetadata: { user: { id: ownerId } } },
        deferred: false,
        replied: false,
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
        async update(payload) {
            calls.push({ type: "update", payload });
        },
        async reply(payload) {
            calls.push({ type: "reply", payload });
        },
    };
    return { ctx: new InteractionContext(interaction), calls };
}

test("the person a view was made for moves through it in place, for everyone to see", async () => {
    const { ctx, calls } = fakeClick({ clickerId: "1", ownerId: "1" });
    await ctx.deferUpdate();
    await ctx.update(buildContainer({ title: "Column" }));
    assert.deepEqual(calls.map((call) => call.type), ["deferUpdate", "editReply"]);
    assert.ok(!(calls[1].payload.flags & MessageFlags.Ephemeral));
});

test("anyone else clicking gets their own private copy, and the shared message is left alone", async () => {
    const { ctx, calls } = fakeClick({ clickerId: "2", ownerId: "1" });
    await ctx.deferUpdate();
    await ctx.update(buildContainer({ title: "Column" }));
    assert.deepEqual(calls.map((call) => call.type), ["deferReply", "editReply"]);
    assert.equal(calls[0].options.flags, MessageFlags.Ephemeral);

    const direct = fakeClick({ clickerId: "2", ownerId: "1" });
    await direct.ctx.update(buildContainer({ title: "Column" }));
    assert.equal(direct.calls[0].type, "reply");
    assert.ok(direct.calls[0].payload.flags & MessageFlags.Ephemeral);
});

test("command replies are visible by default; only what asks for it is private", async () => {
    const replies = [];
    const ctx = new InteractionContext({
        deferred: false,
        replied: false,
        async deferReply(options) {
            this.deferred = true;
            replies.push(options);
        },
    });
    await ctx.defer();
    assert.equal(replies[0].flags, undefined);
});
