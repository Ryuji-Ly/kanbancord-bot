require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { deliverPlan } = require("../src/delivery/deliverPlan");
const { forgetRecentThreads } = require("../src/delivery/taskThreads");

const MIA = "223456789012345678";
const OWNER = "123456789012345678";

function entry(logId, action, changes, entityType = "TASK") {
    return {
        logId, serverId: "999", boardId: 1, boardName: "Sprint", userId: OWNER, actorUsername: "owner",
        actorDisplayName: "Olive", action, entityType, entityId: 100, source: "API", changes,
        createdAt: "2026-09-25T10:00:00",
    };
}

/** A plan for a board with threads in channel 111, as the API sends it. */
function plan(thread, overrides = {}) {
    return {
        batchId: 7,
        serverId: "999",
        board: { boardId: 1, name: "Sprint" },
        task: { taskId: 100, title: "Fix login", deleted: false },
        entries: [
            entry(1, "TASK_CREATED", { created: { taskId: 100, title: "Fix login", columnId: 10 } }),
            entry(2, "TASK_ASSIGNMENT_CREATED", { created: { taskId: 100, userId: MIA } }, "TASK_ASSIGNMENT"),
        ],
        names: { columns: { 10: "Todo" }, labels: {}, priorities: {} },
        channels: [{ channelId: "111", kind: "FEED", entryIds: [1, 2], mentionUserIds: [MIA], mentionRoleIds: [] }],
        directMessages: [],
        thread: {
            channelId: "111", threadId: null, privateThread: false, updates: "BOTH", name: "Fix login", close: false,
            members: [], ...thread,
        },
        ...overrides,
    };
}

/** Records what the bot would do in Discord. */
function fakeDiscord({ gone = [] } = {}) {
    const log = [];
    let next = 900;
    const unknown = Object.assign(new Error("Unknown Channel"), { code: 10003 });
    return {
        log,
        senders: {
            sendToChannel: async (channelId, payload) => {
                if (gone.includes(channelId)) throw unknown;
                log.push({ do: "post", in: channelId, pings: payload.allowedMentions?.users ?? [] });
                return { id: `m${channelId}` };
            },
            sendToUser: async () => {},
            visibility: async () => ({ canSee: true, roleIds: [] }),
            serverName: async () => "Test Server",
            startThread: async (message, name) => {
                log.push({ do: "start", from: message.id, name });
                return { id: String(next++) };
            },
            createThread: async (channelId, { name, privateThread }) => {
                log.push({ do: "create", in: channelId, name, privateThread });
                return { id: String(next++) };
            },
            addThreadMembers: async (threadId, userIds) => log.push({ do: "add", in: threadId, userIds }),
            updateThread: async (threadId, changes) => {
                if (gone.includes(threadId)) throw unknown;
                log.push({ do: "update", in: threadId, ...changes });
            },
            threadIntro: async () => ({ components: [], allowedMentions: {} }),
            reportThread: async (report) => log.push({ do: "report", ...report }),
        },
    };
}

test("a new task's thread starts from its feed post, and is reported", async () => {
    forgetRecentThreads();
    const { log, senders } = fakeDiscord();
    await deliverPlan(plan({}), senders);
    assert.deepEqual(log.map((step) => step.do), ["post", "start", "report"]);
    assert.equal(log[1].from, "m111");
    assert.equal(log[1].name, "Fix login");
    assert.deepEqual(log[2], { do: "report", serverId: "999", taskId: 100, channelId: "111", threadId: "900", privateThread: false });

    // A second plan claimed before the API heard about the thread uses the same one.
    const again = fakeDiscord();
    await deliverPlan(plan({}, {
        entries: [entry(3, "TASK_UPDATED", { title: { from: "a", to: "b" } })],
        channels: [{ channelId: "111", kind: "FEED", entryIds: [3], mentionUserIds: [], mentionRoleIds: [] }],
    }), again.senders);
    assert.ok(!again.log.some((step) => step.do === "start" || step.do === "create"), "no second thread");
    assert.ok(again.log.some((step) => step.do === "post" && step.in === "900"));
});

test("a private thread stands on its own, starts with the task and takes in its people", async () => {
    forgetRecentThreads();
    const { log, senders } = fakeDiscord();
    await deliverPlan(plan({ privateThread: true, members: [OWNER, MIA] }), senders);
    assert.deepEqual(log.map((step) => step.do), ["post", "create", "post", "add", "report"]);
    assert.equal(log[1].privateThread, true);
    assert.equal(log[2].in, "900", "the task, posted in the thread");
    assert.deepEqual(log[3].userIds, [OWNER, MIA]);
});

test("once a task has a thread, its updates go where the board says, pinging once", async () => {
    forgetRecentThreads();
    const both = fakeDiscord();
    await deliverPlan(plan({ threadId: "555" }), both.senders);
    const posts = both.log.filter((step) => step.do === "post");
    assert.deepEqual(posts.map((step) => step.in), ["111", "555"]);
    assert.deepEqual(posts[0].pings, [MIA]);
    assert.deepEqual(posts[1].pings, [], "the thread copy pings nobody");

    const threadOnly = fakeDiscord();
    await deliverPlan(plan({ threadId: "555", updates: "THREAD" }), threadOnly.senders);
    const only = threadOnly.log.filter((step) => step.do === "post");
    assert.deepEqual(only.map((step) => step.in), ["555"]);
    assert.deepEqual(only[0].pings, [MIA], "pings in the thread instead");

    const channelOnly = fakeDiscord();
    await deliverPlan(plan({ threadId: "555", updates: "CHANNEL" }), channelOnly.senders);
    assert.deepEqual(channelOnly.log.filter((step) => step.do === "post").map((step) => step.in), ["111"]);
    assert.ok(channelOnly.log.some((step) => step.do === "update" && step.in === "555"), "still kept up to date");
});

test("a deleted task's thread is archived; a thread deleted in Discord is reported and the channel posted instead", async () => {
    forgetRecentThreads();
    const closing = fakeDiscord();
    await deliverPlan(plan({ threadId: "555", close: true }, { channels: [] }), closing.senders);
    assert.deepEqual(closing.log, [{ do: "update", in: "555", name: "Fix login", close: true, members: [] }]);

    const gone = fakeDiscord({ gone: ["555"] });
    await deliverPlan(plan({ threadId: "555", updates: "THREAD" }), gone.senders);
    assert.deepEqual(gone.log.map((step) => step.do), ["report", "post"]);
    assert.equal(gone.log[0].gone, true);
    assert.equal(gone.log[1].in, "111");
});
