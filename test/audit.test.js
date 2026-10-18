require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { snapshotFixture, textLength } = require("./fixtures");
const { auditPage } = require("../src/services/audit/auditLog");
const { filterFromArgs } = require("../src/ui/auditViews");
const { decode } = require("../src/utils/customId");

const entry = (logId, fields) => ({
    logId, serverId: "999", boardId: 1, boardName: "Sprint", userId: "223456789012345678",
    actorUsername: "mia", actorDisplayName: "Mia", source: "API", createdAt: "2026-10-18T10:00:00", changes: {}, ...fields,
});

/** A context whose API answers the audit log with `pages`, keyed by the `before` it was asked for. */
function fakeContext(pages) {
    const calls = [];
    const get = async (path) => {
        calls.push(path);
        if (path === "/boards") return { content: [snapshotFixture().board] };
        if (path.endsWith("/snapshot")) return snapshotFixture();
        const before = new URL(path, "http://x").searchParams.get("before") ?? "none";
        return pages[before];
    };
    return { calls, ctx: { guildId: "999", user: { id: `user-${Math.random()}` }, api: { get } } };
}

const json = (container) => container.toJSON();
const text = (container) => JSON.stringify(json(container));
const buttons = (container) => (JSON.stringify(json(container)).match(/kc1:audit:[^"]+/g) ?? []).map(decode);

test("/audit names the task each change was about, and where it was made", async () => {
    const { ctx } = fakeContext({
        none: {
            entries: [
                entry(30, { action: "TASK_MOVED", entityType: "TASK", entityId: 100, source: "DISCORD",
                    changes: { _subject: "Fix login", _fromColumn: "Todo", _column: "Done" } }),
                entry(29, { action: "TASK_COMMENT_CREATED", entityType: "TASK_COMMENT", entityId: 7, source: "ACTIVITY",
                    changes: { created: { taskId: 101, content: "Looks good" } } }),
                entry(28, { action: "TASK_LABEL_ADDED", entityType: "TASK_LABEL", entityId: 8,
                    changes: { created: { taskId: 999, labelId: 5 } } }),
            ],
            nextBefore: 28,
        },
    });
    const page = await auditPage(ctx, { boardId: null, userId: null, type: null });
    const shown = text(page);
    assert.ok(shown.includes("Fix login") && shown.includes("moved it from **Todo** to **Done**"));
    assert.ok(shown.includes("with a command") && shown.includes("in the Activity") && shown.includes("on the website"));
    assert.ok(/› Task \\+\*1/.test(shown), "a comment names its task from the board");
    assert.ok(shown.includes("a deleted task"), "a task that is gone says so");
    assert.ok(shown.includes("added the label **Front"), "label names come from the board");

    const [newest, older] = buttons(page);
    assert.equal(newest.action, "newest");
    assert.equal(older.action, "older");
    assert.equal(older.args[3], "28", "the next page starts after the last entry shown");
});

test("/audit sends its filters to the API, and the buttons keep them", async () => {
    const { ctx, calls } = fakeContext({ none: { entries: [], nextBefore: null }, 50: { entries: [], nextBefore: null } });
    const filter = { boardId: "1", userId: "223456789012345678", type: "labels" };
    const page = await auditPage(ctx, filter);
    const call = new URL(calls.find((path) => path.startsWith("/audit-logs")), "http://x");
    assert.equal(call.searchParams.get("boardId"), "1");
    assert.equal(call.searchParams.get("actorUserId"), "223456789012345678");
    assert.deepEqual(call.searchParams.getAll("entityType"), ["LABEL", "TASK_LABEL"]);

    assert.ok(text(page).includes("Nothing matches these filters yet."));
    assert.ok(text(page).includes("Sprint"), "the board is named in the heading");
    const [newest, older] = buttons(page);
    assert.deepEqual(filterFromArgs(newest.args), filter);
    assert.ok(json(page).components.at(-1).components.every((button) => button.disabled), "no other page to go to");
    assert.equal(older.args[3], "0");

    const empty = await auditPage(ctx, { boardId: null, userId: null, type: null }, "50");
    assert.ok(text(empty).includes("No older changes."));
});

test("a page of long comments still fits in one message", async () => {
    const long = "word ".repeat(300);
    const entries = Array.from({ length: 10 }, (_, index) => entry(100 - index, {
        action: "TASK_COMMENT_CREATED", entityType: "TASK_COMMENT", entityId: index, changes: { created: { taskId: 100, content: long } },
    }));
    const { ctx } = fakeContext({ none: { entries, nextBefore: null } });
    const page = await auditPage(ctx, { boardId: null, userId: null, type: null });
    assert.ok(textLength(json(page)) < 4000);
    const older = buttons(page)[1];
    assert.ok(Number(older.args[3]) > 91, "what did not fit comes first on the next page");
    buttons(page).forEach((id) => assert.ok(id.current));
});
