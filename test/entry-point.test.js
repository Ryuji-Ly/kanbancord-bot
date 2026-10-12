require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { withEntryPoint } = require("../src/functions/loadCommands");

const ours = [{ name: "board", description: "Boards", type: 1 }];

test("without Activities there is no entry point, and only our commands are registered", () => {
    assert.deepEqual(withEntryPoint(ours, [{ id: "1", name: "board", type: 1 }]), ours);
});

test("the Activity's Launch command is kept as Discord has it, so replacing the list does not fail", () => {
    const launch = {
        id: "99", application_id: "7", version: "3", type: 4, handler: 2, name: "launch",
        description: "Open KanbanCord", contexts: [0, 1, 2], integration_types: [0, 1], nsfw: false,
    };
    const body = withEntryPoint(ours, [{ id: "1", name: "board", type: 1 }, launch]);
    assert.equal(body.length, 2);
    assert.deepEqual(body[1], {
        id: "99", type: 4, name: "launch", description: "Open KanbanCord", handler: 2,
        contexts: [0, 1, 2], integration_types: [0, 1], nsfw: false,
    });
});
