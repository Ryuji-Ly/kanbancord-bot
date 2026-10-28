require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ActivityType } = require("discord.js");

const { activities } = require("../src/services/status/presence");

const describe = (activity) => (activity.type === ActivityType.Custom ? activity.state : `${activity.type}: ${activity.name}`);

const POINTERS = ["/help for every command", "New here? Try /guide", "Every board at kanbancord.com"];

test("the status rotates through every number, formatted, then the pointers for newcomers", () => {
    const lines = activities({ guilds: 1234, users: 56789, boards: 210, tasks: 4321 }).map(describe);
    assert.deepEqual(lines, [
        "Organising 1,234 servers",
        "210 kanban boards and counting",
        "Keeping track of 4,321 tasks",
        "Helping 56,789 members get organised",
        ...POINTERS,
    ]);
});

test("one of something is singular, and numbers not known yet are left out, never shown as 0", () => {
    assert.deepEqual(activities({ guilds: 1, boards: 1, tasks: 1, users: 1 }).map(describe).slice(0, 4), [
        "Organising 1 server",
        "1 kanban board and counting",
        "Keeping track of 1 task",
        "Helping 1 member get organised",
    ]);
    assert.deepEqual(activities({ guilds: 3 }).map(describe), ["Organising 3 servers", ...POINTERS]);
    assert.deepEqual(activities().map(describe), POINTERS, "with nothing known yet, only the pointers");
});

test("every line is a custom status, the only kind Discord shows in the member list", () => {
    assert.ok(activities({ guilds: 2, users: 3, boards: 4, tasks: 5 }).every((activity) => activity.type === ActivityType.Custom));
});

test("custom statuses carry their text in state, as Discord expects", () => {
    const custom = activities({ tasks: 5 }).find((activity) => activity.type === ActivityType.Custom);
    assert.equal(custom.name, "Custom Status");
    assert.equal(custom.state, "Keeping track of 5 tasks");
});
