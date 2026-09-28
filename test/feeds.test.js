require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { snapshotFixture, textLength } = require("./fixtures");
const { snapshotModel } = require("../src/services/boards/boardData");
const { deliverPlan } = require("../src/delivery/deliverPlan");
const { buildFeedCard } = require("../src/ui/feedViews");
const { componentCount } = require("../src/ui/containers");
const { decode } = require("../src/utils/customId");

const MIA = "223456789012345678";

const idsIn = (json) => (JSON.stringify(json).match(/kc1:[^"]+/g) ?? []);

/** A board with `count` columns, the fixture's tasks in the first. */
function withColumns(count, overrides = {}) {
    const snapshot = snapshotFixture(overrides);
    snapshot.columns = Array.from({ length: count }, (_, index) => ({
        columnId: 10 + index, boardId: 1, name: `Column ${index + 1}`, position: index + 1,
    }));
    return snapshotModel(snapshot);
}

test("a feed card moves with a button per column, or a menu when there are many", () => {
    const few = withColumns(4);
    const json = buildFeedCard(few, few.task(100)).toJSON();
    const moves = json.components.find((row) => row.components?.[0]?.custom_id?.startsWith("kc1:feed:move:"));
    assert.equal(moves.components.length, 4, "every column is a button");
    assert.deepEqual(moves.components.map((button) => Boolean(button.disabled)), [true, false, false, false],
        "the task's own column is lit and cannot be clicked");
    assert.deepEqual(decode(moves.components[2].custom_id).args, ["1", "100", "12"]);

    const many = withColumns(8);
    const menu = JSON.stringify(buildFeedCard(many, many.task(100)).toJSON());
    assert.ok(menu.includes("kc1:feed:moveto:1:100") && !menu.includes("kc1:feed:move:"));
    assert.match(menu, /"value":"10","default":true/);
});

test("a feed card assigns people and roles in one picker, and offers edit, follow and the full view", () => {
    const model = snapshotModel(snapshotFixture());
    const json = buildFeedCard(model, model.task(100)).toJSON();
    const text = JSON.stringify(json);
    assert.ok(textLength(json) < 3000);
    assert.ok(componentCount([json]) <= 32, "room is left for the summary above it");
    assert.deepEqual(idsIn(json).map((id) => decode(id).action), ["move", "move", "move", "assign", "edit", "follow", "more"]);
    idsIn(json).forEach((id) => assert.equal(decode(id).feature, "feed", "nothing on a shared post opens a view in its place"));
    assert.ok(text.includes(`"default_values":[{"id":"${MIA}","type":"user"},{"id":"323456789012345678","type":"role"}]`),
        "whoever is assigned now is picked already");

    const noPeople = snapshotModel(snapshotFixture({ features: { ASSIGNEES: false } }));
    assert.ok(!idsIn(buildFeedCard(noPeople, noPeople.task(100)).toJSON()).some((id) => id.includes(":assign:")));
    const archived = snapshotModel({ ...snapshotFixture(), board: { ...snapshotFixture().board, isArchived: true } });
    assert.deepEqual(idsIn(buildFeedCard(archived, archived.task(100)).toJSON()).map((id) => decode(id).action),
        ["follow", "more"], "an archived board can only be followed and looked at");
});

function planFixture(channels) {
    return {
        batchId: 7,
        serverId: "999",
        board: { boardId: 1, name: "Sprint" },
        task: { taskId: 100, title: "Task *0*", deleted: false },
        entries: [{
            logId: 1, serverId: "999", boardId: 1, userId: "123456789012345678", actorDisplayName: "Olive",
            action: "TASK_ASSIGNMENT_CREATED", entityType: "TASK_ASSIGNMENT", entityId: 100, source: "API",
            changes: { created: { taskId: 100, userId: MIA } }, createdAt: "2026-09-28T10:00:00",
        }],
        names: { columns: {}, labels: {}, priorities: {} },
        channels,
        directMessages: [],
    };
}

function senders({ loadBoard } = {}) {
    const sent = [];
    const loads = [];
    return {
        sent,
        loads,
        senders: {
            sendToChannel: async (channelId, payload) => {
                sent.push({ channelId, payload });
            },
            sendToUser: async () => {},
            visibility: async () => ({ canSee: false, roleIds: [] }),
            serverName: async () => "Test Server",
            loadBoard: async (serverId, boardId) => {
                loads.push(`${serverId}:${boardId}`);
                return loadBoard ? loadBoard() : snapshotModel(snapshotFixture());
            },
        },
    };
}

const feed = (channelId, interactive) =>
    ({ channelId, kind: "FEED", entryIds: [1], mentionUserIds: [MIA], mentionRoleIds: [], interactive });

test("interactive feeds post the task card under the summary; plain ones and the audit channel do not", async () => {
    const { sent, loads, senders: fake } = senders();
    await deliverPlan(planFixture([feed("1", true), feed("2", true), feed("3", false),
        { channelId: "4", kind: "AUDIT", entryIds: [1], mentionUserIds: [], mentionRoleIds: [], interactive: false }]), fake);

    assert.deepEqual(loads, ["999:1"], "the board is loaded once for every channel");
    const [first, second, plain, audit] = sent.map((entry) => entry.payload);
    assert.equal(first.components.length, 2);
    assert.equal(second.components.length, 2);
    const summary = JSON.stringify(first.components[0].toJSON());
    assert.ok(!summary.includes("Open task"), "the card carries the link instead");
    assert.ok(JSON.stringify(first.components[1].toJSON()).includes("kc1:feed:assign:1:100"));
    assert.deepEqual(first.allowedMentions, { users: [MIA], roles: [] }, "the same people are pinged as before");
    assert.ok(componentCount(first.components) <= 40);

    assert.equal(plain.components.length, 1);
    assert.ok(JSON.stringify(plain.components[0].toJSON()).includes("Open task"));
    assert.equal(audit.components.length, 1);
});

test("without a card to show, an interactive feed still posts, plainly", async () => {
    const failing = senders({ loadBoard: () => Promise.reject(new Error("API down")) });
    const result = await deliverPlan(planFixture([feed("1", true)]), failing.senders);
    assert.equal(result.sent, 1);
    assert.equal(failing.sent[0].payload.components.length, 1);

    const gone = senders({ loadBoard: async () => snapshotModel({ ...snapshotFixture(), tasks: [] }) });
    await deliverPlan(planFixture([feed("1", true)]), gone.senders);
    assert.equal(gone.sent[0].payload.components.length, 1, "the task was deleted meanwhile");

    const deleted = senders();
    await deliverPlan({ ...planFixture([feed("1", true)]), task: { taskId: 100, title: "Old", deleted: true } }, deleted.senders);
    assert.deepEqual(deleted.loads, [], "a deleted task has no card, so the board is not even loaded");
});

require("../src/interactions/feedActions");
const interactionCreate = require("../src/events/interactionCreate");
const { Collection } = require("discord.js");

/** A button on a feed post: a message the bot posted itself, so it belongs to nobody. */
function feedClick(customId, replies, { values } = {}) {
    const summary = { toJSON: () => ({ type: 17, components: [{ type: 10, content: "### Task *0*\n**Olive** assigned Mia" }] }) };
    return {
        customId,
        values,
        user: { id: "555" },
        guildId: "999",
        message: { interactionMetadata: null, components: [summary, { toJSON: () => ({ type: 17, components: [] }) }] },
        deferred: false,
        replied: false,
        client: { commands: new Collection() },
        isAutocomplete: () => false,
        isChatInputCommand: () => false,
        isMessageComponent: () => true,
        isModalSubmit: () => false,
        isRepliable: () => true,
        async deferUpdate() {
            this.deferred = true;
            replies.push({ type: "deferUpdate" });
        },
        async deferReply(options) {
            this.deferred = true;
            replies.push({ type: "deferReply", options });
        },
        async editReply(payload) {
            replies.push({ type: "editReply", payload });
        },
        async followUp(payload) {
            replies.push({ type: "followUp", payload });
        },
    };
}

async function withApi(answer, run) {
    const requests = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        const request = { method: init.method, url: String(url), headers: init.headers, body: init.body };
        requests.push(request);
        const { status = 200, body = {} } = answer(request) ?? {};
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    try {
        await run();
    } finally {
        global.fetch = originalFetch;
    }
    return requests;
}

const snapshotAnswer = (request) => (request.url.includes("snapshot") ? { body: snapshotFixture() } : undefined);

test("moving from a feed post acts as the clicker, then redraws the card for everyone under the same summary", async () => {
    const replies = [];
    const requests = await withApi(snapshotAnswer, () =>
        interactionCreate.execute(feedClick("kc1:feed:move:1:100:12", replies)));

    const move = requests.find((request) => request.method === "POST");
    assert.equal(move.url, "http://localhost:8080/api/servers/999/boards/1/tasks/100/move");
    assert.equal(move.headers["X-Acting-User-Id"], "555", "with the clicker's permissions");
    assert.ok(requests.some((request) => request.url.includes("/api/internal/board-posts/snapshot?serverId=999&boardId=1")),
        "the card is drawn from the whole board, as the channel sees it");
    assert.equal(replies[0].type, "deferUpdate", "the post itself is updated, not answered privately");
    const [summary, card] = replies.at(-1).payload.components.map((component) =>
        JSON.stringify(typeof component.toJSON === "function" ? component.toJSON() : component));
    assert.ok(summary.includes("Olive** assigned Mia"), "what happened stays as it was");
    assert.ok(card.includes("kc1:feed:assign:1:100"));
    assert.deepEqual(replies.at(-1).payload.allowedMentions, { parse: [] }, "redrawing never pings again");
});

test("a refused change leaves the post alone and tells only the clicker", async () => {
    const replies = [];
    await withApi((request) => (request.method === "POST"
        ? { status: 403, body: { message: "You do not have permission to move tasks" } }
        : snapshotAnswer(request)), () => interactionCreate.execute(feedClick("kc1:feed:move:1:100:12", replies)));
    assert.ok(!replies.some((reply) => reply.type === "editReply"), "the post is not redrawn");
    const error = replies.find((reply) => reply.type === "followUp");
    assert.ok(error && (error.payload.flags & 64), "the error is only shown to the clicker");
});

test("following from a feed post answers privately and toggles", async () => {
    const replies = [];
    const requests = await withApi(snapshotAnswer, () =>
        interactionCreate.execute(feedClick("kc1:feed:follow:1:100", replies)));
    assert.equal(replies[0].type, "deferReply");
    assert.ok(replies[0].options.flags & 64, "only the clicker sees the answer");
    const follow = requests.find((request) => request.method === "PUT");
    assert.equal(follow.url, "http://localhost:8080/api/servers/999/boards/1/tasks/100/follow");
    assert.match(JSON.stringify(replies.at(-1).payload.components[0].toJSON()), /You are following/);

    replies.length = 0;
    const again = await withApi((request) => (request.url.includes("snapshot")
        ? { body: { ...snapshotFixture(), followedTaskIds: [100] } }
        : undefined), () => interactionCreate.execute(feedClick("kc1:feed:follow:1:100", replies)));
    assert.ok(again.some((request) => request.method === "DELETE" && request.url.endsWith("/tasks/100/follow")),
        "following already, so it unfollows");
});
