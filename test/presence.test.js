require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ActivityType } = require("discord.js");

const { activities } = require("../src/services/status/presence");

const describe = (activity) => (activity.type === ActivityType.Custom ? activity.state : `${activity.type}: ${activity.name}`);

test("the status rotates through every number, formatted, then the pointers for newcomers", () => {
    const lines = activities({ guilds: 1234, users: 56789, boards: 210, tasks: 4321 }).map(describe);
    assert.deepEqual(lines, [
        `${ActivityType.Watching}: 1,234 servers`,
        `${ActivityType.Watching}: 210 kanban boards`,
        "📋 Keeping track of 4,321 tasks",
        "👥 Helping 56,789 members get organised",
        `${ActivityType.Listening}: /help`,
        "New here? Try /guide",
    ]);
});

test("one of something is singular, and numbers not known yet are left out, never shown as 0", () => {
    assert.deepEqual(activities({ guilds: 1, boards: 1, tasks: 1, users: 1 }).map(describe).slice(0, 4), [
        `${ActivityType.Watching}: 1 server`,
        `${ActivityType.Watching}: 1 kanban board`,
        "📋 Keeping track of 1 task",
        "👥 Helping 1 member get organised",
    ]);
    assert.deepEqual(activities({ guilds: 3 }).map(describe), [
        `${ActivityType.Watching}: 3 servers`,
        `${ActivityType.Listening}: /help`,
        "New here? Try /guide",
    ]);
    assert.equal(activities().length, 2, "with nothing known yet, only the pointers");
});

test("custom statuses carry their text in state, as Discord expects", () => {
    const custom = activities({ tasks: 5 }).find((activity) => activity.type === ActivityType.Custom);
    assert.equal(custom.name, "Custom Status");
    assert.equal(custom.state, "📋 Keeping track of 5 tasks");
});
