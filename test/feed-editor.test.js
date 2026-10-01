require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/interactions/feedSettings");
const { route } = require("../src/utils/interactionRouter");
const { InteractionContext } = require("../src/utils/interactionContext");
const { buildBoardFeedEditor, buildFeedEditor } = require("../src/ui/feedEditorViews");
const { componentCount } = require("../src/ui/containers");

const catalogue = [
    { key: "TASKS", label: "Tasks", events: [
        { key: "TASK_CREATED", label: "Task created", canMention: false },
        { key: "TASK_MOVED", label: "Task moved to another column", canMention: true },
    ] },
    { key: "PEOPLE", label: "People", events: [{ key: "USER_ASSIGNED", label: "Someone assigned", canMention: true }] },
];
const feed = {
    feedId: 4, channelId: "5", boardIds: [], interactive: true, mentionRoles: false,
    events: { TASK_CREATED: true, TASK_MOVED: true, USER_ASSIGNED: true }, mentions: { USER_ASSIGNED: true },
};
const settings = { auditChannelId: null, feeds: [feed], channels: [{ channelId: "5", name: "updates" }], catalogue };
const boards = { content: [{ boardId: 7, name: "Design" }, { boardId: 8, name: "Ops" }] };
const boardNotifications = {
    feeds: [{
        feedId: 4, channelId: "5", channelName: "updates", everyBoard: true, interactive: true,
        feedEvents: feed.events, feedMentions: feed.mentions,
        own: { events: { TASK_CREATED: false }, mentions: {}, changes: 1 },
    }],
    catalogue,
};

/** The API, answering as it would; records what was changed. */
function fakeApi() {
    const changes = [];
    const original = global.fetch;
    global.fetch = async (url, init) => {
        const path = new URL(String(url)).pathname.replace("/api/servers/999", "");
        if (init.method !== "GET") {
            changes.push([init.method, path, init.body ? JSON.parse(init.body) : null]);
        }
        const body = path === "/notifications" ? settings
            : path === "/boards" ? boards
                : path.startsWith("/boards/7/notifications") ? boardNotifications : {};
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    return { changes, restore: () => { global.fetch = original; } };
}

async function click(customId, values) {
    const calls = [];
    const interaction = {
        customId, values, user: { id: `u${Math.random()}` }, guildId: "999", message: {},
        deferred: false, replied: false, isModalSubmit: () => false,
        async deferUpdate() { this.deferred = true; },
        async editReply(payload) { calls.push(payload); },
    };
    const { handler, id } = route(interaction);
    await handler(new InteractionContext(interaction), id);
    return JSON.stringify(calls.at(-1).components[0].toJSON());
}

test("the feed editor shows what the feed does, with a menu per setting, within Discord's limits", () => {
    const view = buildFeedEditor({ feed, catalogue, channelName: "updates", boards: boards.content });
    const json = JSON.stringify(view.toJSON());
    assert.ok(json.includes("Feed in #updates") && json.includes("**Boards:** every board"));
    assert.ok(json.includes("Mentions the people involved for:** Someone assigned"));
    for (const id of ["kc1:feedcfg:events:4", "kc1:feedcfg:mentions:4", "kc1:feedcfg:boards:4", "kc1:feedcfg:interactive:4"]) {
        assert.ok(json.includes(id), id);
    }
    assert.ok(componentCount([view]) <= 40);

    const board = buildBoardFeedEditor({ board: { boardId: 7, name: "Design" }, feed: boardNotifications.feeds[0], catalogue });
    assert.ok(JSON.stringify(board.toJSON()).includes("Changed for this board: Task created"));
});

test("each menu saves its setting, for every event: chosen ones on, the rest off", async () => {
    const api = fakeApi();
    try {
        await click("kc1:feedcfg:events:4", ["TASK_MOVED"]);
        await click("kc1:feedcfg:mentions:4", ["TASK_MOVED", "USER_ASSIGNED"]);
        await click("kc1:feedcfg:boards:4", ["7", "8"]);
        await click("kc1:feedcfg:boards:4", ["all", "7"]);
        await click("kc1:feedcfg:interactive:4", []);
        assert.deepEqual(api.changes, [
            ["PUT", "/notifications/feeds/4", { events: { TASK_CREATED: false, TASK_MOVED: true, USER_ASSIGNED: false } }],
            ["PUT", "/notifications/feeds/4", { mentions: { TASK_MOVED: true, USER_ASSIGNED: true } }],
            ["PUT", "/notifications/feeds/4", { boardIds: [7, 8] }],
            ["PUT", "/notifications/feeds/4", { boardIds: [] }],
            ["PUT", "/notifications/feeds/4", { interactive: false }],
        ]);
    } finally {
        api.restore();
    }
});

test("a board changes a feed for itself, and can go back to the feed's settings", async () => {
    const api = fakeApi();
    try {
        const list = await click("kc1:bfeed:list:7", []);
        assert.ok(list.includes("#updates · every board · 1 change for this board"));
        await click("kc1:bfeed:events:7:4", ["TASK_MOVED", "USER_ASSIGNED"]);
        const reset = await click("kc1:bfeed:reset:7:4", []);
        assert.deepEqual(api.changes, [
            ["PUT", "/boards/7/notifications/feeds/4", { events: { TASK_CREATED: false, TASK_MOVED: true, USER_ASSIGNED: true } }],
            ["DELETE", "/boards/7/notifications/feeds/4", null],
        ]);
        assert.ok(reset.includes("follows the feed's settings again"));
    } finally {
        api.restore();
    }
});
