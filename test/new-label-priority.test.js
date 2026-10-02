require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/interactions/taskActions");
const { route } = require("../src/utils/interactionRouter");
const { InteractionContext } = require("../src/utils/interactionContext");
const panels = require("../src/ui/taskPanels");
const { snapshotModel } = require("../src/services/boards/boardData");
const { snapshotFixture } = require("./fixtures");

test("the labels and priority panels offer New label and New priority, even before any exist", () => {
    const model = snapshotModel(snapshotFixture());
    const task = model.task(100);
    const labels = JSON.stringify(panels.labelsPanel(model, task).toJSON());
    assert.ok(labels.includes("kc1:act:labels:1:100") && labels.includes("kc1:act:newlabel:1:100"));
    assert.ok(JSON.stringify(panels.priorityPanel(model, task).toJSON()).includes("kc1:act:newprio:1:100"));

    const empty = snapshotModel({ ...snapshotFixture(), labels: [], taskLabels: [], priorities: [] });
    const firstLabel = JSON.stringify(panels.labelsPanel(empty, empty.task(100)).toJSON());
    assert.ok(firstLabel.includes("no labels yet") && !firstLabel.includes("kc1:act:labels:"), "no empty menu");
    assert.ok(JSON.stringify(panels.priorityPanel(empty, empty.task(100)).toJSON()).includes("no priority levels"));
    const menu = JSON.stringify(panels.actionsRow(empty, empty.task(100),
        { applyLabel: true, setPriority: true }, "1").toJSON());
    assert.ok(menu.includes("\"value\":\"labels\"") && menu.includes("\"value\":\"priority\""), "offered from the start");
});

test("the forms ask for a name, a colour or where the level goes", () => {
    const model = snapshotModel(snapshotFixture());
    const label = panels.newLabelModal(model, model.task(100)).toJSON();
    assert.equal(label.custom_id, "kc1:act:newlabel:1:100");
    assert.ok(JSON.stringify(label).includes("🔵 Blue"));
    const level = JSON.stringify(panels.newPriorityModal(model, model.task(100)).toJSON());
    assert.ok(level.includes("Most urgent: above all the others") && level.includes("Below High"));
});

/** The board as the API would show it after the calls so far: with the label or level just made. */
function withCreated(snapshot, calls) {
    if (calls.includes("POST /boards/1/labels")) {
        snapshot.labels.push({ labelId: 77, boardId: 1, name: "Bug", color: "#dc2626" });
    }
    if (calls.includes("POST /boards/1/priorities")) {
        snapshot.priorities.unshift({ priorityId: 8, boardId: 1, name: "Blocker", color: "#64748b", position: 1 });
    }
    return snapshot;
}

/** Submits a form, with the API answering; returns the API calls made, in order. */
async function submit(customId, fields) {
    const calls = [];
    const original = global.fetch;
    global.fetch = async (url, init) => {
        const path = new URL(String(url)).pathname.replace("/api/servers/999", "");
        calls.push(`${init.method} ${path}`);
        const body = path === "/boards/1/labels" ? { labelId: 77, name: "Bug" }
            : path === "/boards/1/priorities" ? { priorityId: 8, name: "Blocker" }
                : path.endsWith("/snapshot") ? withCreated(snapshotFixture(), calls) : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    const replies = [];
    const interaction = {
        customId, user: { id: `u${Math.random()}` }, guildId: "999", message: {},
        deferred: false, replied: false,
        isModalSubmit: () => true, isFromMessage: () => true,
        fields: {
            getTextInputValue: (id) => fields[id],
            getStringSelectValues: (id) => (fields[id] ? [fields[id]] : []),
        },
        async deferUpdate() { this.deferred = true; },
        async editReply(payload) { replies.push(JSON.stringify(payload.components[0].toJSON())); },
    };
    try {
        const { handler, id } = route(interaction);
        await handler(new InteractionContext(interaction), id);
    } finally {
        global.fetch = original;
    }
    return { calls: calls.filter((call) => !call.startsWith("GET")), reply: replies.at(-1) };
}

test("a new label is made and put on the task, keeping the labels it had", async () => {
    const { calls, reply } = await submit("kc1:act:newlabel:1:100", { name: "Bug", color: "#dc2626" });
    assert.deepEqual(calls, ["POST /boards/1/labels", "POST /boards/1/tasks/100/labels"]);
    assert.ok(reply.includes("Created label **Bug** and added it to this task."));
});

test("a new priority level is made where asked, and set on the task", async () => {
    const { calls, reply } = await submit("kc1:act:newprio:1:100", { name: "Blocker", position: "1" });
    assert.deepEqual(calls, ["POST /boards/1/priorities", "POST /boards/1/priorities/8/move", "PUT /boards/1/tasks/100"]);
    assert.ok(reply.includes("Created priority **Blocker** and set it on this task."));
});
