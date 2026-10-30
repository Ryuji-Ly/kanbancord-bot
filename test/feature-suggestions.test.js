require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { forgetShown, sendFeatureSuggestions, suggestionsView } = require("../src/services/guide/featureSuggestions");
const { textLength } = require("./fixtures");

const SUGGESTIONS = [
    { feature: "LABELS", signal: "TAGS", examples: ["[M]", "[US1-T3]"], count: 5, scope: "SERVER", canEnable: false },
    { feature: "PRIORITIES", signal: "MARKS", examples: ["[E]", "high prio"], count: 5, scope: "SERVER", canEnable: false },
];

function context(suggestions = SUGGESTIONS) {
    const sent = [];
    return {
        sent,
        ctx: {
            user: { id: "555" },
            interaction: { followUp: async (payload) => sent.push(payload) },
            api: { get: async () => ({ suggestions }) },
        },
    };
}

test("a suggestion quotes what was noticed, with a button per feature and one to dismiss", () => {
    const json = suggestionsView(SUGGESTIONS, 7).toJSON();
    const text = JSON.stringify(json);
    assert.match(text, /tags like `\[M\]` and `\[US1-T3\]`/);
    assert.match(text, /marked `\[E\]` and `\\"high prio\\"`/);
    assert.match(text, /kc1:fsug:on:7:LABELS/);
    assert.match(text, /kc1:fsug:dismiss:7:LABELS\.PRIORITIES/);
    assert.ok(textLength(suggestionsView(SUGGESTIONS, 7)) < 4000);
    assert.equal(suggestionsView([], 7), null);
});

test("suggestions arrive privately, at most once a day per person and board, and never break the command", async () => {
    forgetShown();
    const first = context();
    await sendFeatureSuggestions(first.ctx, 7);
    assert.equal(first.sent.length, 1);
    assert.ok(first.sent[0].flags & 64, "ephemeral");

    const again = context();
    await sendFeatureSuggestions(again.ctx, 7);
    assert.equal(again.sent.length, 0, "not again the same day");
    await sendFeatureSuggestions(again.ctx, 8);
    assert.equal(again.sent.length, 1, "another board is another tip");

    const none = context([]);
    await sendFeatureSuggestions(none.ctx, 9);
    assert.equal(none.sent.length, 0);

    const failing = context();
    failing.ctx.api.get = async () => { throw new Error("API down"); };
    await sendFeatureSuggestions(failing.ctx, 10);
    assert.equal(failing.sent.length, 0);
});
