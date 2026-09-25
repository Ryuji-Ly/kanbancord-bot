require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");

const { describeEntry } = require("../src/services/notifications/describe");
const { buildAuditMessage, buildDirectMessage, buildFeedMessage } = require("../src/ui/notificationViews");
const { deliverPlan } = require("../src/delivery/deliverPlan");
const { runOnce } = require("../src/delivery/deliveryWorker");
const { textLength } = require("./fixtures");

const MIA = "223456789012345678";
const MAX = "323456789012345678";
const OWNER = "123456789012345678";
const ROLE = "523456789012345678";

function entry(logId, action, changes, extra = {}) {
    return {
        logId,
        serverId: "999",
        boardId: 1,
        boardName: "Sprint",
        userId: OWNER,
        actorUsername: "owner",
        actorDisplayName: "Olive *",
        action,
        entityType: extra.entityType ?? "TASK",
        entityId: 100,
        source: extra.source ?? "API",
        changes,
        createdAt: "2026-09-25T10:00:00",
    };
}

/** A plan shaped exactly as the API sends it. */
function planFixture(overrides = {}) {
    return {
        batchId: 7,
        serverId: "999",
        board: { boardId: 1, name: "Sprint" },
        task: { taskId: 100, title: "Fix login", deleted: false },
        entries: [
            entry(1, "TASK_CREATED", { created: { taskId: 100, title: "Fix login", columnId: 10 } }),
            entry(2, "TASK_ASSIGNMENT_CREATED", { created: { taskId: 100, userId: MIA } }, { entityType: "TASK_ASSIGNMENT" }),
            entry(3, "TASK_COMMENT_CREATED", { created: { taskId: 100, content: "Let's go\n**now**" } }, { entityType: "TASK_COMMENT" }),
        ],
        names: { columns: { 10: "Todo", 11: "Doing" }, labels: { 5: "Bug" }, priorities: { 1: "High" } },
        channels: [
            { channelId: "111", kind: "FEED", entryIds: [1, 2, 3], mentionUserIds: [MIA], mentionRoleIds: [] },
            { channelId: "222", kind: "AUDIT", entryIds: [1, 2, 3], mentionUserIds: [], mentionRoleIds: [] },
        ],
        directMessages: [{ userId: MIA, entryIds: [2, 3], mode: "UNLESS_PINGED" }],
        ...overrides,
    };
}

test("entries read as short sentences about the task in the heading", () => {
    const names = planFixture().names;
    const line = (action, changes, extra) => describeEntry(entry(1, action, changes, extra), names);
    assert.equal(line("TASK_CREATED", { created: { columnId: 10 } }), "**Olive \\***  created it in **Todo**".replace("  ", " "));
    assert.equal(line("TASK_MOVED", { _fromColumn: "Todo", _column: "Doing" }), "**Olive \\*** moved it from **Todo** to **Doing**");
    assert.equal(line("TASK_UPDATED", {
        title: { from: "a", to: "Fix *login*" },
        dueDate: { from: null, to: "2030-01-01T09:00:00" },
        priorityId: { from: null, to: 1 },
        description: { from: "x", to: null },
    }), "**Olive \\*** renamed it to **Fix \\*login\\***, removed the description, set it due <t:1893488400:f> (<t:1893488400:R>), set the priority to **High**");
    assert.equal(line("TASK_UPDATED", { dueDate: { from: "2030-01-01T09:00:00", to: null } }), "**Olive \\*** removed the due date");
    assert.equal(line("TASK_ASSIGNMENT_DELETED", { deleted: { userId: MIA } }), `**Olive \\*** unassigned <@${MIA}>`);
    assert.equal(line("TASK_ROLE_ASSIGNED", { created: { roleId: ROLE } }), `**Olive \\*** assigned the role <@&${ROLE}>`);
    assert.equal(line("TASK_LABEL_ADDED", { created: { labelId: 5 } }), "**Olive \\*** added the label **Bug**");
    assert.equal(line("TASK_LABEL_REMOVED", { deleted: { labelId: 99 } }), "**Olive \\*** removed the label a label");
    assert.equal(line("TASK_COMMENT_CREATED", { created: { content: "one\ntwo" } }), "**Olive \\*** commented:\n> one\n> two");
    assert.equal(line("COLUMN_UPDATED", { name: { from: "Doing", to: "In progress" } }, { entityType: "BOARD_COLUMN" }),
        "**Olive \\*** renamed column **Doing** to **In progress**");
    assert.equal(line("COLUMN_CREATED", { created: { name: "Review" } }, { entityType: "BOARD_COLUMN" }),
        "**Olive \\*** created column **Review**");
    assert.equal(line("BOARD_ARCHIVED", { isArchived: { from: false, to: true } }, { entityType: "BOARD" }),
        "**Olive \\*** archived the board");
});

test("a feed post pings exactly the people the plan says, and names the rest without pinging", () => {
    const plan = planFixture();
    const payload = buildFeedMessage(plan, { ...plan.channels[0], mentionUserIds: [MIA, MAX] });
    assert.ok(payload.flags & MessageFlags.IsComponentsV2);
    assert.deepEqual(payload.allowedMentions, { users: [MIA, MAX], roles: [] });
    const text = JSON.stringify(payload.components[0].toJSON());
    assert.ok(text.includes("### Fix login") && text.includes("-# Sprint"));
    assert.ok(text.includes(`assigned <@${MIA}>`));
    assert.ok(text.includes(`\"<@${MAX}>\"`), "someone to ping who is not named in the lines is added on their own");
    assert.ok(!text.includes(`<@${MIA}> <@${MAX}>`), "people already named are not added twice");
    assert.ok(text.includes("https://kanbancord.com/boards/1?serverId=999&task=100"));
});

test("audit posts ping nobody; direct messages need no pings and explain themselves", () => {
    const plan = planFixture({ entries: [...planFixture().entries.slice(0, 2), entry(3, "TASK_UPDATED", { title: { from: "a", to: "b" } }, { source: "DISCORD" })] });
    const audit = buildAuditMessage(plan, plan.channels[1]);
    assert.deepEqual(audit.allowedMentions, { parse: [] });
    const auditText = JSON.stringify(audit.components[0].toJSON());
    assert.ok(auditText.includes("**Sprint › Fix login**") && auditText.includes("<t:1790330400:t>") && auditText.includes("*(via Discord)*"));

    const dm = buildDirectMessage(plan, plan.directMessages[0], "Test Server");
    assert.deepEqual(dm.allowedMentions, { parse: [] });
    const dmText = JSON.stringify(dm.components[0].toJSON());
    assert.ok(dmText.includes("Sprint in Test Server") && dmText.includes("Settings → Notifications"));
    assert.ok(!dmText.includes("created it"), "only the entries meant for this person");
    assert.ok(dmText.includes("assigned you") && !dmText.includes(`<@${MIA}>`), "written to the person");

    const deleted = buildFeedMessage({ ...plan, task: { taskId: 100, title: "Gone", deleted: true } }, plan.channels[0]);
    const deletedText = JSON.stringify(deleted.components[0].toJSON());
    assert.ok(deletedText.includes("~~Gone~~") && deletedText.includes("Open board") && !deletedText.includes("&task=100"));
});

test("a big batch stays within Discord's message size", () => {
    const entries = Array.from({ length: 200 }, (_, index) =>
        entry(index + 1, "TASK_COMMENT_CREATED", { created: { content: "x".repeat(400) } }, { entityType: "TASK_COMMENT" }));
    const plan = planFixture({ entries });
    const ids = entries.map((item) => item.logId);
    for (const payload of [
        buildFeedMessage(plan, { channelId: "1", kind: "FEED", entryIds: ids, mentionUserIds: [], mentionRoleIds: [] }),
        buildAuditMessage(plan, { channelId: "2", kind: "AUDIT", entryIds: ids, mentionUserIds: [], mentionRoleIds: [] }),
        buildDirectMessage(plan, { userId: MIA, entryIds: ids, mode: "ALWAYS" }, "Server"),
    ]) {
        assert.ok(textLength(payload.components[0]) <= 4000, `text is ${textLength(payload.components[0])}`);
    }
});

/** Senders that record what was sent, with who can see which channel. */
function fakeSenders({ visible = {}, roles = {}, fail = {} } = {}) {
    const sent = [];
    return {
        sent,
        senders: {
            sendToChannel: async (channelId, payload) => {
                if (fail[channelId]) throw fail[channelId];
                sent.push({ to: `#${channelId}`, payload });
            },
            sendToUser: async (userId, payload) => {
                if (fail[userId]) throw fail[userId];
                sent.push({ to: `@${userId}`, payload });
            },
            visibility: async (_guildId, channelId, userId) => ({
                canSee: Boolean(visible[`${channelId}:${userId}`]),
                roleIds: roles[userId] ?? [],
            }),
            serverName: async () => "Test Server",
        },
    };
}

test("no direct message for someone a post just mentioned in a channel they can see", async () => {
    const { sent, senders } = fakeSenders({ visible: { [`111:${MIA}`]: true } });
    const result = await deliverPlan(planFixture(), senders);
    assert.deepEqual(sent.map((item) => item.to), ["#111", "#222"]);
    assert.deepEqual(result, { sent: 2, skipped: 1, retry: false });
});

test("a direct message after all when the mention was in a channel they cannot see, or they want them always", async () => {
    const hidden = fakeSenders({ visible: {} });
    await deliverPlan(planFixture(), hidden.senders);
    assert.deepEqual(hidden.sent.map((item) => item.to), ["#111", "#222", `@${MIA}`]);

    const always = fakeSenders({ visible: { [`111:${MIA}`]: true } });
    const plan = planFixture({ directMessages: [{ userId: MIA, entryIds: [2, 3], mode: "ALWAYS" }] });
    await deliverPlan(plan, always.senders);
    assert.deepEqual(always.sent.map((item) => item.to), ["#111", "#222", `@${MIA}`]);

    // A failed post mentioned nobody, so the direct message still goes.
    const failed = fakeSenders({ visible: { [`111:${MIA}`]: true }, fail: { 111: Object.assign(new Error("Missing Permissions"), { code: 50013, status: 403 }) } });
    await deliverPlan(planFixture(), failed.senders);
    assert.deepEqual(failed.sent.map((item) => item.to), ["#222", `@${MIA}`]);
});

test("a role mention counts for the people who have the role", async () => {
    const plan = planFixture({
        channels: [{ channelId: "111", kind: "FEED", entryIds: [1, 2, 3], mentionUserIds: [], mentionRoleIds: [ROLE] }],
    });
    const withRole = fakeSenders({ visible: { [`111:${MIA}`]: true }, roles: { [MIA]: [ROLE] } });
    await deliverPlan(plan, withRole.senders);
    assert.deepEqual(withRole.sent.map((item) => item.to), ["#111"]);

    const without = fakeSenders({ visible: { [`111:${MIA}`]: true }, roles: { [MIA]: [] } });
    await deliverPlan(plan, without.senders);
    assert.deepEqual(without.sent.map((item) => item.to), ["#111", `@${MIA}`]);
});

test("refusals that will not change are skipped; when nothing got through for a passing reason, try again", async () => {
    const closedDms = fakeSenders({ fail: { [MIA]: Object.assign(new Error("Cannot send messages to this user"), { code: 50007, status: 403 }) } });
    assert.deepEqual(await deliverPlan(planFixture(), closedDms.senders), { sent: 2, skipped: 1, retry: false });

    const down = new Error("getaddrinfo ENOTFOUND discord.com");
    const outage = fakeSenders({ fail: { 111: down, 222: down, [MIA]: down } });
    assert.equal((await deliverPlan(planFixture(), outage.senders)).retry, true);

    const partial = fakeSenders({ fail: { 111: down } });
    assert.equal((await deliverPlan(planFixture(), partial.senders)).retry, false,
        "once something was posted, trying again would post it twice");
});

test("each claimed plan is reported delivered, or failed to be tried again", async () => {
    const reports = [];
    const api = {
        claimPlans: async () => [planFixture(), planFixture({ batchId: 8 })],
        reportDelivered: async (id) => reports.push(`delivered ${id}`),
        reportFailed: async (id) => reports.push(`failed ${id}`),
    };
    const down = new Error("ECONNRESET");
    let calls = 0;
    const { senders } = fakeSenders();
    const flaky = {
        ...senders,
        sendToChannel: async (...args) => {
            if (++calls > 2) throw down;
            return senders.sendToChannel(...args);
        },
        sendToUser: async () => {
            throw down;
        },
    };
    assert.equal(await runOnce(flaky, api), 2);
    assert.deepEqual(reports, ["delivered 7", "failed 8"]);
});
