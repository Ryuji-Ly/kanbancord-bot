require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { snapshotFixture, textLength } = require("./fixtures");
const { parseDue, toServerTime, toInputText } = require("../src/utils/dueDate");
const { abilitiesOf } = require("../src/services/boards/abilities");
const { snapshotModel } = require("../src/services/boards/boardData");
const actions = require("../src/services/boards/taskActions");
const panels = require("../src/ui/taskPanels");
const { buildTaskView } = require("../src/ui/taskViews");
const { decode } = require("../src/utils/customId");

const NOW = new Date("2026-09-25T10:30:00Z");

test("due dates: dates, times, offsets, words, and removing", () => {
    const iso = (input) => parseDue(input, NOW)?.toISOString() ?? null;
    assert.equal(iso("2026-10-01"), "2026-10-01T23:59:00.000Z", "a date alone is due at the end of the day");
    assert.equal(iso("2026-10-01 17:00"), "2026-10-01T17:00:00.000Z");
    assert.equal(iso("2026-10-01T09:05"), "2026-10-01T09:05:00.000Z");
    assert.equal(iso("2026-10-01 17:00 +02:00"), "2026-10-01T15:00:00.000Z");
    assert.equal(iso("2026-10-01 17:00 -0500"), "2026-10-01T22:00:00.000Z");
    assert.equal(iso("today"), "2026-09-25T23:59:00.000Z");
    assert.equal(iso("Tomorrow"), "2026-09-26T23:59:00.000Z");
    assert.equal(iso("in 3 days"), "2026-09-28T23:59:00.000Z");
    assert.equal(iso("in 1 week"), "2026-10-02T23:59:00.000Z");
    assert.equal(iso("in 5 hours"), "2026-09-25T15:30:00.000Z");
    for (const clear of ["none", "clear", "", "  "]) {
        assert.equal(parseDue(clear, NOW), null);
    }
    for (const bad of ["2026-02-30", "2026-13-01", "next friday", "2026-10-01 25:00", "in -1 days"]) {
        assert.throws(() => parseDue(bad, NOW), /not a date I understand/, bad);
    }
    assert.equal(toServerTime(new Date("2026-10-01T17:00:00Z")), "2026-10-01T17:00:00");
    assert.equal(toInputText(new Date("2026-10-01T17:00:00Z")), "2026-10-01 17:00");
});

/** A context whose API records every request and answers from a board snapshot. */
function fakeContext(snapshot = snapshotFixture()) {
    const calls = [];
    const answer = (method) => async (path, options = {}) => {
        calls.push({ method, path, body: options.body, query: options.query });
        if (method === "GET" && path.endsWith("/snapshot")) {
            return snapshot;
        }
        if (method === "POST" && path.endsWith("/tasks")) {
            return { taskId: 500, title: options.body.title };
        }
        return {};
    };
    return {
        calls,
        ctx: {
            guildId: "999",
            user: { id: "555" },
            api: { get: answer("GET"), post: answer("POST"), put: answer("PUT"), patch: answer("PATCH"), delete: answer("DELETE") },
        },
    };
}

const writes = (calls) => calls.filter((call) => call.method !== "GET");

test("an edit sends the whole task, changing only what was asked", async () => {
    const { ctx, calls } = fakeContext();
    await actions.setPriority(ctx, 1, 100, null);
    await actions.setDue(ctx, 1, 100, new Date("2026-10-01T17:00:00Z"));
    await actions.editTask(ctx, 1, 100, { title: " New title ", description: undefined });
    const [priority, due, edit] = writes(calls);

    assert.equal(priority.path, "/boards/1/tasks/100");
    assert.deepEqual(priority.body, {
        title: "Task *0*",
        description: snapshotFixture().tasks[0].description,
        boardId: 1,
        columnId: 10,
        priorityId: null,
        dueDate: "2030-01-01T09:00:00",
    });
    assert.equal(due.body.dueDate, "2026-10-01T17:00:00");
    assert.equal(due.body.priorityId, 1, "fields not being changed are sent as they are");
    assert.equal(edit.body.title, "New title");
    assert.equal(edit.body.description, snapshotFixture().tasks[0].description,
        "a description left out of the form (too long for it) is kept");
});

test("assigning works out what to add and remove, and reports refusals without undoing the rest", async () => {
    const { ctx, calls } = fakeContext();
    const originalPost = ctx.api.post;
    ctx.api.post = async (path, options) => {
        if (options?.body?.userId === "777") {
            await originalPost(path, options);
            const error = new Error("You may only assign yourself");
            error.name = "ApiError";
            throw error;
        }
        return originalPost(path, options);
    };
    const result = await actions.setAssignees(ctx, 1, 100, ["555", "777"]);
    const made = writes(calls).map((call) => `${call.method} ${call.path} ${call.body?.userId ?? ""}`.trim());
    assert.deepEqual(made, [
        "POST /boards/1/tasks/100/assignments 555",
        "POST /boards/1/tasks/100/assignments 777",
        "DELETE /boards/1/tasks/100/assignments/1",
    ]);
    assert.match(result.notice, /<@777>: You may only assign yourself/);
});

test("labels, roles, moves and deletes send the right requests", async () => {
    const { ctx, calls } = fakeContext();
    await actions.setLabels(ctx, 1, 100, []);
    await actions.setRoles(ctx, 1, 100, ["423456789012345678"]);
    const moved = await actions.moveTask(ctx, 1, 100, 11);
    await actions.deleteTask(ctx, 1, 101);
    await actions.addColumn(ctx, 1, "  Review ");
    await actions.moveColumn(ctx, 1, 12, 99);
    await actions.setBoardArchived(ctx, 1, true);
    const made = writes(calls).map((call) => ({ method: call.method, path: call.path, body: call.body, query: call.query }));

    assert.deepEqual(made[0], { method: "DELETE", path: "/boards/1/tasks/100/labels/9", body: undefined, query: undefined });
    assert.deepEqual(made[1].body, { roleId: "423456789012345678" });
    assert.equal(made[2].path, "/boards/1/tasks/100/role-assignments/2");
    assert.deepEqual(made[3], { method: "POST", path: "/boards/1/tasks/100/move", body: { columnId: 11, index: 0 }, query: undefined });
    assert.match(moved.notice, /Moved to \*\*Doing\*\*/);
    assert.equal(made[4].method + made[4].path, "DELETE/boards/1/tasks/101");
    assert.deepEqual(made[5].body, { name: "Review", boardId: 1 });
    assert.deepEqual(made[6].body, { index: 2 }, "a position past the end moves the column to the end");
    assert.deepEqual(made[7].query, { archived: true });
});

test("the actions menu offers only what the user may do on this board", () => {
    const snapshot = snapshotFixture();
    const model = snapshotModel(snapshot);
    const task = model.task(100);
    const optionsFor = (permissions, features) => {
        const abilities = abilitiesOf({ ...snapshot, permissions, features: { ...snapshot.features, ...features } });
        return panels.taskActions(model, task, abilities, "555").map((action) => action.value);
    };

    const everything = Object.fromEntries(["EDIT_TASK", "MOVE_TASK", "DELETE_TASK", "ASSIGN_TASK_SELF", "ASSIGN_TASK_OTHERS",
        "CREATE_TASK_COMMENT", "APPLY_LABEL_TO_TASK", "REMOVE_LABEL_FROM_TASK"].map((key) => [key, { allowed: true }]));
    assert.deepEqual(optionsFor(everything), ["edit", "move", "people", "roles", "labels", "priority", "due", "comment", "delete"]);
    assert.deepEqual(optionsFor({ MOVE_TASK: { allowed: true }, ASSIGN_TASK_SELF: { allowed: true } }), ["move", "assignme"]);
    assert.deepEqual(optionsFor(everything, { LABELS: false, PRIORITIES: false, DUE_DATES: false, COMMENTS: false, ASSIGNEES: false }),
        ["edit", "move", "delete"]);
    assert.deepEqual(optionsFor({}), []);
    const archived = abilitiesOf({ ...snapshot, board: { ...snapshot.board, isArchived: true }, permissions: everything });
    assert.deepEqual(panels.taskActions(model, task, archived, "555"), [], "archived boards cannot be changed");

    const view = buildTaskView(model, task, { abilities: abilitiesOf({ ...snapshot, permissions: {} }) }).toJSON();
    assert.ok(!JSON.stringify(view).includes("kc1:act:menu"), "no menu when nothing can be done");
});

test("every panel and form is valid for Discord", () => {
    const model = snapshotModel(snapshotFixture({ tasks: 40 }));
    const task = model.task(100);
    for (const build of [panels.movePanel, panels.peoplePanel, panels.rolesPanel, panels.labelsPanel, panels.priorityPanel, panels.deletePanel]) {
        const json = build(model, task).toJSON();
        assert.ok(textLength(json) < 4000);
        const ids = JSON.stringify(json).match(/kc1:[^"]+/g) ?? [];
        assert.ok(ids.length > 0);
        ids.forEach((id) => assert.ok(decode(id).current && id.length <= 100, id));
    }
    const people = panels.peoplePanel(model, task).toJSON();
    assert.ok(JSON.stringify(people).includes("\"default_values\":[{\"id\":\"223456789012345678\",\"type\":\"user\"}]"),
        "the people already assigned are pre-selected");

    const edit = panels.editTaskModal(1, task).toJSON();
    assert.equal(edit.components.length, 2);
    const long = panels.editTaskModal(1, { ...task, description: "x".repeat(4001) }).toJSON();
    assert.equal(long.components.length, 1, "a description too long for the form is left out rather than cut short");
    assert.equal(panels.dueModal(1, task).toJSON().components[0].component.value, "2030-01-01 09:00");
    panels.createTaskModal(1, 10).toJSON();
    panels.commentModal(1, 100).toJSON();
});
