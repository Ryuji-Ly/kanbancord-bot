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
    assert.ok(!/"value":"TASK_CREATED"[^}]*"default":true/.test(text), "offered in the menu, not chosen");
    assert.ok(text.includes("kc1:ntf:events") && text.includes("kc1:ntf:also"));
    assert.ok(text.includes("Also tasks you follow and tasks you commented on"), "following is on unless switched off");
    const notFollowing = JSON.stringify(buildMyNotificationsPanel({ ...settings, includeFollowed: false, includeCommented: false },
        "999", "Test Server").toJSON());
    assert.ok(notFollowing.includes("Not tasks you follow"));
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
                { feedId: 1, channelId: "2", boardIds: [], events: { TASK_MOVED: true, TASK_CREATED: true, USER_ASSIGNED: true },
                    mentions: { TASK_MOVED: true, TASK_CREATED: false, USER_ASSIGNED: true, ROLE_ASSIGNED: true }, mentionRoles: false,
                    interactive: true },
                { feedId: 2, channelId: "9", boardIds: [1], events: {}, mentions: {}, mentionRoles: false },
            ],
            catalogue,
        },
        boards: [{ boardId: 1, name: "Design" }],
    }).toJSON());
    assert.ok(text.includes("**Audit log channel:** #audit-log"));
    assert.ok(text.includes("#updates · every board · with buttons"), text);
    assert.ok(text.includes("Tasks, People · mentions for Tasks, People"),
        "mentions are per event; a category is named when any of its posted events mentions");
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

test("/kanbancord feed updates the channel's feed for the same boards, and adds one otherwise", async () => {
    const { saveFeed } = require("../src/services/settings/notificationSettings");
    const feeds = [
        { feedId: 1, channelId: "2", boardIds: [], interactive: false },
        { feedId: 2, channelId: "2", boardIds: [7], interactive: true },
    ];
    const run = async (channelId, board, interactive) => {
        const calls = [];
        const ctx = {
            guildId: "999",
            user: { id: `u${Math.random()}` },
            api: {
                get: async (path) => (path === "/notifications" ? { feeds } : { content: [{ boardId: 7, name: "Design" }, { boardId: 8, name: "Ops" }] }),
                put: async (path, { body }) => {
                    calls.push(`PUT ${path} ${JSON.stringify(body)}`);
                    return { interactive: body.interactive ?? false };
                },
                post: async (path, { body }) => {
                    calls.push(`POST ${path} ${JSON.stringify(body)}`);
                    return { interactive: body.interactive };
                },
            },
        };
        const result = await saveFeed(ctx, channelId, board, interactive);
        return { calls, result };
    };

    let { calls, result } = await run("2", null, null);
    assert.deepEqual(calls, ["PUT /notifications/feeds/1 {}"], "same channel, every board: that feed, left as it was");
    assert.equal(result.updated, true);
    assert.equal(result.interactive, false);

    ({ calls } = await run("2", "7", false));
    assert.deepEqual(calls, ["PUT /notifications/feeds/2 {\"interactive\":false}"], "same channel and board");

    ({ calls, result } = await run("2", "8", null));
    assert.deepEqual(calls, ["POST /notifications/feeds {\"channelId\":\"2\",\"boardIds\":[8],\"interactive\":true}"],
        "same channel, another board: a new feed, interactive");
    assert.equal(result.updated, false);

    ({ calls } = await run("5", null, null));
    assert.deepEqual(calls, ["POST /notifications/feeds {\"channelId\":\"5\",\"boardIds\":[],\"interactive\":true}"],
        "another channel: a new feed");
});
