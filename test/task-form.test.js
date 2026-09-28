require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection } = require("discord.js");

const { snapshotFixture } = require("./fixtures");
const { snapshotModel } = require("../src/services/boards/boardData");
const actions = require("../src/services/boards/taskActions");
const { newTaskModal, readNewTask } = require("../src/ui/taskForm");

const fieldIds = (modal) => modal.toJSON().components.map((label) => label.component.custom_id);

test("the new-task form asks for what the board has switched on, as far as five fields go", () => {
    const simple = snapshotModel(snapshotFixture({
        features: { LABELS: false, PRIORITIES: false, ASSIGNEES: false, COMMENTS: false, DUE_DATES: false },
    }));
    assert.deepEqual(fieldIds(newTaskModal({ customId: "kc1:act:create:1:10", model: simple })), ["title", "description"],
        "simple mode: a title and a description");

    const everything = snapshotModel(snapshotFixture());
    assert.deepEqual(fieldIds(newTaskModal({ customId: "kc1:act:create:1:10", model: everything })),
        ["title", "description", "people", "due", "priority"], "people, due date and priority first; labels on the task");
    assert.deepEqual(fieldIds(newTaskModal({ customId: "kc1:post:create:1", model: everything, chooseColumn: true })),
        ["title", "description", "column", "people", "due"]);

    const noPeople = snapshotModel(snapshotFixture({ features: { ASSIGNEES: false, DUE_DATES: false } }));
    const json = newTaskModal({ customId: "kc1:act:create:1:10", model: noPeople }).toJSON();
    assert.deepEqual(json.components.map((label) => label.component.custom_id), ["title", "description", "priority", "labels"]);
    assert.ok(json.components.slice(2).every((label) => label.component.required === false), "every extra is optional");
    assert.ok(json.title.length <= 45);
});

/** Form fields as discord.js hands them over; missing ones throw, as they do there. */
function fakeFields(values) {
    const get = (id) => {
        if (!(id in values)) {
            throw new Error(`No field ${id}`);
        }
        return values[id];
    };
    return {
        getTextInputValue: get,
        getStringSelectValues: get,
        getSelectedUsers: (id) => new Collection(get(id).map((userId) => [userId, { id: userId }])),
    };
}

test("a filled-in form creates the task with everything in it, and a bad date does not lose the task", async () => {
    const form = readNewTask(fakeFields({
        title: " Ship it ", description: "", people: ["777"], due: "not a date", priority: ["1"], labels: ["5"],
    }));
    assert.deepEqual(form, { title: " Ship it ", description: "", columnId: undefined, people: ["777"], due: "not a date",
        priorityId: "1", labelIds: ["5"] });
    assert.deepEqual(readNewTask(fakeFields({ title: "Plain" })), { title: "Plain", description: undefined, columnId: undefined,
        people: undefined, due: undefined, priorityId: undefined, labelIds: undefined }, "switched-off fields are simply absent");

    const calls = [];
    const snapshot = snapshotFixture();
    const answer = (method) => async (path, options = {}) => {
        calls.push(`${method} ${path} ${options.body ? JSON.stringify(options.body) : ""}`.trim());
        if (path.endsWith("/snapshot")) {
            return snapshot;
        }
        return method === "POST" && path.endsWith("/tasks") ? { taskId: 100, title: options.body.title } : {};
    };
    const ctx = { guildId: "999", user: { id: "555" }, api: { get: answer("GET"), post: answer("POST"), delete: answer("DELETE") } };
    const result = await actions.createTask(ctx, 1, 10, form);
    const writes = calls.filter((call) => !call.startsWith("GET"));
    assert.equal(writes[0], 'POST /boards/1/tasks {"title":"Ship it","description":null,"boardId":1,"columnId":10,"priorityId":1,"dueDate":null}');
    assert.ok(writes.includes('POST /boards/1/tasks/100/assignments {"taskId":100,"userId":"777"}'));
    assert.match(result.notice, /Created \*\*Ship it\*\*\n"not a date" is not a date I understand/);

    calls.length = 0;
    await actions.createTask(ctx, 1, 10, { title: "Due", due: "2030-01-01 09:00" });
    assert.match(calls.find((call) => call.startsWith("POST /boards/1/tasks ")), /"dueDate":"2030-01-01T09:00:00"/);
});
