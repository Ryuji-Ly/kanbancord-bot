require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { describeEntry } = require("../src/services/notifications/describe");
const { buildMyNotificationsPanel, buildServerNotificationsPanel } = require("../src/ui/settingsViews");
const { forUser } = require("../src/api/kanbanApi");
const { textLength } = require("./fixtures");

const catalogue = [
    { key: "TASKS", label: "Tasks", events: [
        { key: "TASK_MOVED", label: "Task moved to another column", canDm: true },
        { key: "DUE_SOON", label: "Due within a day (reminder)", canDm: true },
        { key: "TASK_CREATED", label: "Task created", canDm: true },
    ] },
    { key: "PEOPLE", label: "People", events: [
        { key: "USER_ASSIGNED", label: "Someone assigned", canDm: true },
        { key: "ROLE_ASSIGNED", label: "Role assigned", canDm: false },
    ] },
    { key: "BOARD", label: "Board structure", events: [{ key: "COLUMN_CHANGED", label: "Columns changed", canDm: false }] },
];

test("reminders read as what they are, with nobody named as having done them", () => {
    const reminder = (action) => describeEntry({ action, entityType: "TASK", changes: { dueDate: "2030-01-01T09:00" } }, {});
    assert.equal(reminder("TASK_DUE_SOON"), "⏰ Due <t:1893488400:f> (<t:1893488400:R>)");
    assert.equal(reminder("TASK_OVERDUE"), "⚠️ Overdue: it was due <t:1893488400:f> (<t:1893488400:R>)");
});

test("the personal panel shows what you hear about, and offers this server's setting", () => {
    const settings = {
        dmMode: "UNLESS_PINGED",
        events: { TASK_MOVED: true, DUE_SOON: true, TASK_CREATED: false, USER_ASSIGNED: true },
        includeCommented: true,
        servers: { 999: "ASSIGNMENTS" },
        catalogue,
    };
    const json = buildMyNotificationsPanel(settings, "999", "Test Server").toJSON();
    const text = JSON.stringify(json);
    assert.ok(text.includes("Task moved to another column, Due within a day (reminder), I am assigned"), text);
    assert.ok(!text.includes("Task created"));
    assert.ok(text.includes("Also tasks you commented on"));
    assert.ok(text.includes("kc1:ntf:mode") && text.includes("kc1:ntf:server"));
    assert.ok(/"value":"ASSIGNMENTS"[^}]*"default":true/.test(text), "this server's setting is selected");

    const off = JSON.stringify(buildMyNotificationsPanel({ ...settings, dmMode: "NEVER" }, "999", "Test Server").toJSON());
    assert.ok(off.includes("Direct messages are off"));
    assert.ok(textLength(json) < 4000);
});

test("the server panel lists the audit channel and each feed's channel, boards, events and mentions", () => {
    const text = JSON.stringify(buildServerNotificationsPanel({
        settings: {
            auditChannelId: "3",
            channels: [{ channelId: "2", name: "updates" }, { channelId: "3", name: "audit-log" }],
            feeds: [
                { feedId: 1, channelId: "2", boardIds: [], events: { TASK_MOVED: true }, mentions: { PEOPLE: true }, mentionRoles: false },
                { feedId: 2, channelId: "9", boardIds: [1], events: {}, mentions: {}, mentionRoles: false },
            ],
            catalogue,
        },
        boards: [{ boardId: 1, name: "Design" }],
    }).toJSON());
    assert.ok(text.includes("**Audit log channel:** #audit-log"));
    assert.ok(text.includes("#updates · every board") && text.includes("Tasks · mentions for People"));
    assert.ok(text.includes("a channel that no longer exists · Design"));
});

test("your own notification settings are changed as you, and nothing else outside the server", async () => {
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
        const api = forUser({ userId: "555", guildId: "999" });
        await api.myNotifications.update({ servers: { 999: "NONE" } });
        await api.get("/boards");
    } finally {
        global.fetch = originalFetch;
    }
    assert.equal(calls[0].url, "http://localhost:8080/api/me/notifications");
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].headers["X-Acting-User-Id"], "555");
    assert.deepEqual(JSON.parse(calls[0].body), { servers: { 999: "NONE" } });
    assert.equal(calls[1].url, "http://localhost:8080/api/servers/999/boards");
});
