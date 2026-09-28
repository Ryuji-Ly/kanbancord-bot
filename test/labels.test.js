require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { snapshotFixture, textLength } = require("./fixtures");
const { colorChoices, colorDot, nextColor, parseColor, PALETTE } = require("../src/utils/colors");
const { snapshotModel } = require("../src/services/boards/boardData");
const actions = require("../src/services/boards/labelActions");
const { respondBoardOptions } = require("../src/services/boards/autocomplete");
const views = require("../src/ui/labelViews");
const { decode } = require("../src/utils/customId");

/** A context whose API records every request and answers from a board snapshot. */
function fakeContext(snapshot = snapshotFixture()) {
    const calls = [];
    const answer = (method) => async (path, options = {}) => {
        calls.push({ method, path, body: options.body });
        if (method === "GET" && path.endsWith("/snapshot")) {
            return snapshot;
        }
        if (method === "GET" && path === "/boards") {
            return { content: [snapshot.board] };
        }
        if (method === "POST" && path.endsWith("/labels")) {
            return { labelId: 6, ...options.body };
        }
        if (method === "POST" && path.endsWith("/priorities")) {
            return { priorityId: 7, ...options.body };
        }
        return {};
    };
    return {
        calls,
        ctx: {
            guildId: "999",
            user: { id: `user-${Math.random()}` },
            api: { get: answer("GET"), post: answer("POST"), put: answer("PUT"), patch: answer("PATCH"), delete: answer("DELETE") },
        },
    };
}

const writes = (calls) => calls.filter((call) => call.method !== "GET");

/** A board with the five default levels, most urgent first. */
function withLevels(snapshot = snapshotFixture()) {
    snapshot.priorities = ["Critical", "High", "Medium", "Low", "Ignorable"].map((name, index) => ({
        priorityId: index + 1, boardId: 1, name, color: "#dc2626", position: index + 1,
    }));
    return snapshot;
}

test("colours: names, hex with or without #, and a clear refusal otherwise", () => {
    assert.equal(parseColor("red"), "#dc2626");
    assert.equal(parseColor(" Gray "), "#64748b");
    assert.equal(parseColor("#ABCDEF"), "#abcdef");
    assert.equal(parseColor("123abc"), "#123abc");
    for (const bad of ["crimson", "#12345", "#1234567", "rgb(1,2,3)"]) {
        assert.throws(() => parseColor(bad), /not a colour/, bad);
    }
    assert.equal(colorDot("#dc2626"), "🔴");
    assert.equal(colorDot("#2563eb"), "🔵");
    assert.equal(colorDot("#16a34a"), "🟢");
    assert.equal(colorDot(null), "⚪");

    assert.equal(nextColor([]), PALETTE[0].hex, "an empty board starts with the first palette colour");
    assert.equal(nextColor([PALETTE[0].hex, PALETTE[1].hex.toUpperCase()]), PALETTE[2].hex, "the least used colour is next");

    assert.equal(colorChoices("#abcdef")[0].value, "#abcdef", "a typed hex colour is offered first");
    assert.deepEqual(colorChoices("pu").map((choice) => choice.value), ["#9333ea"]);
    assert.equal(colorChoices("").length, 11);
});

test("creating a label picks an unused colour, and refuses a name the board already has", async () => {
    const snapshot = snapshotFixture();
    snapshot.labels[0].color = PALETTE[0].hex;
    const { ctx, calls } = fakeContext(snapshot);
    const result = await actions.createLabel(ctx, 1, { name: "  Bug  " });
    assert.deepEqual(writes(calls)[0], { method: "POST", path: "/boards/1/labels", body: { name: "Bug", boardId: 1, color: PALETTE[1].hex } },
        "the board's label has the first palette colour, so the second is next");
    assert.match(result.notice, /Created label \*\*Bug\*\*/);

    await assert.rejects(actions.createLabel(ctx, 1, { name: "front`END" }), /already has a label/);
    await assert.rejects(actions.createLabel(ctx, 1, { name: "   " }), /Give it a name/);
    const off = fakeContext(snapshotFixture({ features: { LABELS: false } }));
    await assert.rejects(actions.createLabel(off.ctx, 1, { name: "Bug" }), /switched off/);
});

test("editing a label sends its name and colour, keeping whichever was not changed", async () => {
    const { ctx, calls } = fakeContext();
    await actions.editLabel(ctx, 1, 5, { color: "#dc2626" });
    await actions.editLabel(ctx, 1, 5, { name: "Frontend" });
    const [colour, rename] = writes(calls);
    assert.deepEqual(colour, { method: "PUT", path: "/boards/1/labels/5", body: { name: "Front`end", boardId: 1, color: "#dc2626" } });
    assert.deepEqual(rename.body, { name: "Frontend", boardId: 1, color: "#3b82f6" });
    await assert.rejects(actions.editLabel(ctx, 1, 5, {}), /Give a new name, a new colour, or both/);
    await assert.rejects(actions.editLabel(ctx, 1, 404, { name: "X" }), /no longer exists/);
    await actions.editLabel(ctx, 1, 5, { name: "FRONT`END" });
    assert.equal(writes(calls).length, 3, "renaming a label to itself in another case is fine");
});

test("priority levels: create at a position, edit keeps the colour, move clamps, delete", async () => {
    const { ctx, calls } = fakeContext(withLevels());
    await actions.createPriority(ctx, 1, { name: "Urgent", color: "#ff0000", position: 1 });
    await actions.createPriority(ctx, 1, { name: "Someday" });
    await actions.createPriority(ctx, 1, { name: "Later", position: 99 });
    await actions.editPriority(ctx, 1, 2, { name: "Important" });
    const moved = await actions.movePriority(ctx, 1, 5, 0);
    await actions.movePriority(ctx, 1, 1, 99);
    await actions.deletePriority(ctx, 1, 3);
    const made = writes(calls).map((call) => `${call.method} ${call.path} ${JSON.stringify(call.body ?? null)}`);

    assert.deepEqual(made, [
        `POST /boards/1/priorities {"name":"Urgent","color":"#ff0000"}`,
        `POST /boards/1/priorities/7/move {"index":0}`,
        `POST /boards/1/priorities {"name":"Someday"}`,
        `POST /boards/1/priorities {"name":"Later"}`,
        `PUT /boards/1/priorities/2 {"name":"Important","color":"#dc2626"}`,
        `POST /boards/1/priorities/5/move {"index":0}`,
        `POST /boards/1/priorities/1/move {"index":4}`,
        "DELETE /boards/1/priorities/3 null",
    ]);
    assert.match(moved.notice, /to position 1/);
    await assert.rejects(actions.createPriority(ctx, 1, { name: "high" }), /already has a priority level/);
    const off = fakeContext(snapshotFixture({ features: { PRIORITIES: false } }));
    await assert.rejects(actions.movePriority(off.ctx, 1, 1, 1), /Priorities are switched off/);
});

test("lists and delete confirmations are valid for Discord and count the tasks affected", () => {
    const model = snapshotModel(withLevels(snapshotFixture({ tasks: 5 })));
    for (const view of [views.buildLabelList(model), views.buildPriorityList(model)]) {
        assert.ok(textLength(view) < 4000);
    }
    const labels = JSON.stringify(views.buildLabelList(model).toJSON());
    assert.ok(labels.includes("🔵 **Front\\\\`end** · 1 task"), labels);
    const levels = JSON.stringify(views.buildPriorityList(model).toJSON());
    assert.ok(levels.includes("1. 🔴 **Critical** · 5 tasks"), "every fixture task is Critical");
    assert.ok(levels.indexOf("Critical") < levels.indexOf("Ignorable"), "most urgent first");

    const labelDelete = JSON.stringify(views.labelDeletePanel(model, model.labels()[0]).toJSON());
    assert.match(labelDelete, /taken off the 1 task that have it/);
    const levelDelete = JSON.stringify(views.priorityDeletePanel(model, model.priorities()[0]).toJSON());
    assert.match(levelDelete, /The 5 tasks with this priority will have none/);
    for (const json of [labelDelete, levelDelete]) {
        const ids = json.match(/kc1:[^"]+/g);
        assert.equal(ids.length, 2);
        ids.forEach((id) => assert.ok(decode(id).current, id));
    }

    const empty = snapshotModel({ ...snapshotFixture(), labels: [], priorities: [], features: { LABELS: false } });
    assert.match(JSON.stringify(views.buildLabelList(empty).toJSON()), /no labels yet.*switched off|switched off.*no labels yet/s);
});

test("autocomplete: /priority never offers \"No priority\", /task priority does, and colours need no board", async () => {
    const snapshot = withLevels();
    const respond = async (commandName, focused, board = "1") => {
        let answered;
        const { ctx } = fakeContext(snapshot);
        ctx.interaction = {
            commandName,
            options: { getFocused: () => focused, getString: (name) => (name === "board" ? board : null) },
            respond: async (choices) => {
                answered = choices;
            },
        };
        await respondBoardOptions(ctx);
        return answered.map((choice) => choice.value);
    };
    assert.deepEqual(await respond("priority", { name: "priority", value: "" }), ["1", "2", "3", "4", "5"]);
    assert.deepEqual(await respond("task", { name: "priority", value: "" }), ["1", "2", "3", "4", "5", "none"]);
    assert.deepEqual(await respond("label", { name: "color", value: "red" }, null), ["#dc2626"]);
});
