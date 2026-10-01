require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection } = require("discord.js");

const { draftFromMessage, findDraft, saveDraft } = require("../src/services/boards/messageTask");
const { boardPicker } = require("../src/interactions/messageTask");
const { newTaskModal } = require("../src/ui/taskForm");
const { snapshotModel } = require("../src/services/boards/boardData");
const { snapshotFixture } = require("./fixtures");

function message(content, extra = {}) {
    return {
        content,
        url: "https://discord.com/channels/999/5/77",
        channel: { name: "design" },
        member: { displayName: "Mira" },
        author: { username: "mira.dev" },
        attachments: new Collection(),
        mentions: {
            users: new Collection([["42", { username: "jonas", globalName: "Jonas" }]]),
            members: new Collection(),
            roles: new Collection([["7", { name: "Artists" }]]),
            channels: new Collection([["8", { name: "art" }]]),
        },
        ...extra,
    };
}

test("a short, one-line message becomes the title, with a link back in the description", () => {
    const draft = draftFromMessage(message("Fix the login button <@42>"));
    assert.equal(draft.title, "Fix the login button @Jonas");
    assert.equal(draft.description, "From [Mira's message](https://discord.com/channels/999/5/77) in #design.");
});

test("a longer message goes in the description and leaves the title to be written", () => {
    const text = "We should:\n- ask <@&7> for the sprites\n- move them to <#8> <:pog:123>";
    const draft = draftFromMessage(message(text));
    assert.equal(draft.title, "");
    assert.ok(draft.description.startsWith("We should:\n- ask @Artists for the sprites\n- move them to #art :pog:"));
    assert.ok(draft.description.endsWith("in #design."));

    const long = draftFromMessage(message("x".repeat(250)));
    assert.equal(long.title, "", "too long for a title");
});

test("a very long message is cut to fit, saying so, and attachments are pointed to", () => {
    const attachments = new Collection([["1", {}], ["2", {}]]);
    const draft = draftFromMessage(message("y".repeat(5000), { attachments }));
    assert.ok(draft.description.length <= 4000, `${draft.description.length}`);
    assert.ok(draft.description.includes("*(Cut off here; the whole message is linked below.)*"));
    assert.ok(draft.description.endsWith("It had 2 attachments; see the original message."));

    const empty = draftFromMessage(message("", { attachments: new Collection([["1", {}]]) }));
    assert.equal(empty.title, "");
    assert.ok(empty.description.includes("It had 1 attachment;"));
});

test("drafts wait for the person who made them, and the form starts filled in", () => {
    const id = saveDraft("555", { title: "Fix it", description: "From here." });
    assert.deepEqual(findDraft(id, "555"), { title: "Fix it", description: "From here." });
    assert.equal(findDraft(id, "556"), null, "not someone else's");

    const model = snapshotModel(snapshotFixture());
    const form = newTaskModal({ customId: "kc1:brd:task:1", model, chooseColumn: true, prefill: findDraft(id, "555") }).toJSON();
    const inputs = form.components.map((label) => label.component);
    assert.equal(inputs[0].value, "Fix it");
    assert.equal(inputs[1].value, "From here.");
});

test("the board picker offers boards posted in the channel first", () => {
    const boards = [{ boardId: 1, name: "Sprint" }, { boardId: 2, name: "Design" }, { boardId: 3, name: "Ops" }];
    const json = boardPicker("abc", { title: "", description: "Long text\nmore" }, boards, [boards[1]]).toJSON();
    const text = JSON.stringify(json);
    assert.ok(text.includes("kc1:msgtask:board:abc:2") && text.includes("Add to Design"));
    assert.ok(text.includes("kc1:msgtask:pick:abc") && text.includes("Posted in this channel"));
    assert.ok(text.includes("> Long text"));
});
