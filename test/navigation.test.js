require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection } = require("discord.js");

const { snapshotFixture, textLength } = require("./fixtures");
const { snapshotModel } = require("../src/services/boards/boardData");
const views = require("../src/ui/boardViews");
const { buildCommentPage } = require("../src/ui/commentViews");
const { componentCount } = require("../src/ui/containers");
const { decode } = require("../src/utils/customId");
require("../src/interactions/boards");
require("../src/interactions/boardActions");
require("../src/interactions/taskActions");
const interactionCreate = require("../src/events/interactionCreate");

const ids = (container) => (JSON.stringify(container.toJSON()).match(/kc1:[^"]+/g) ?? []).map((id) => {
    const { feature, action } = decode(id);
    return `${feature}:${action}`;
});

function assertValid(container) {
    const json = container.toJSON();
    assert.ok(textLength(json) < 4000);
    assert.ok(componentCount([json]) <= 40, `${componentCount([json])} components`);
}

test("every view leads onward: boards, a board, a column, comments", () => {
    const boards = [{ boardId: 1, name: "Sprint", description: "The sprint", isArchived: false }, { boardId: 2, name: "Old", isArchived: true }];
    const list = views.buildBoardList(boards);
    assertValid(list);
    assert.deepEqual(ids(list), ["board:pick", "board:new"], "open any board, or create one");
    assert.match(JSON.stringify(list.toJSON()), /"label":"Old \(archived\)"/);
    assert.deepEqual(ids(views.buildBoardList([])), ["board:new"], "no boards yet: create one");

    const model = snapshotModel(snapshotFixture({ tasks: 40, longText: true }));
    const board = views.buildBoardOverview(model);
    assertValid(board);
    assert.deepEqual(ids(board), ["board:column", "task:open", "board:addtask", "board:addcol", "board:edit", "board:list"]);

    const column = views.buildColumnView(model, 10, 0);
    assertValid(column);
    assert.deepEqual(ids(column), ["task:open", "col:move", "board:page", "board:page", "board:open", "col:addtask", "col:rename", "col:ask"]);
    assert.match(JSON.stringify(column.toJSON()), /"label":"Position 1 \(here now\)","value":"1","default":true/);

    const comments = buildCommentPage({ board: model.board, task: model.task(100), comments: [], page: 0, pages: 1, total: 0 });
    assert.deepEqual(ids(comments).slice(-2), ["task:show", "comment:add"]);
});

test("controls are shown to everyone; only an archived board takes nothing new", () => {
    const archived = snapshotModel({ ...snapshotFixture(), board: { ...snapshotFixture().board, isArchived: true }, permissions: {} });
    const disabled = (container) => (JSON.stringify(container.toJSON()).match(/"custom_id":"kc1:[^"]+"[^}]*"disabled":true/g) ?? [])
        .map((match) => decode(match.match(/kc1:[^"]+/)[0]).action);
    assert.deepEqual(disabled(views.buildBoardOverview(archived)), ["addtask", "addcol", "edit"]);
    const open = snapshotModel({ ...snapshotFixture(), permissions: {} });
    assert.deepEqual(disabled(views.buildBoardOverview(open)), [], "no permissions, nothing hidden or disabled");
});

/** A click on a message the same user created. */
function click(customId, replies, { values, fields } = {}) {
    return {
        customId,
        values,
        fields: fields && {
            getTextInputValue: (id) => fields[id],
            getStringSelectValues: (id) => fields[id] ?? (() => { throw new Error("no field"); })(),
            getSelectedUsers: () => { throw new Error("no field"); },
        },
        user: { id: "555" },
        guildId: "999",
        message: { interactionMetadata: { user: { id: "555" } } },
        deferred: false,
        replied: false,
        client: { commands: new Collection() },
        isAutocomplete: () => false,
        isChatInputCommand: () => false,
        isMessageComponent: () => !fields,
        isModalSubmit: () => Boolean(fields),
        isFromMessage: () => true,
        isRepliable: () => true,
        async deferUpdate() {
            this.deferred = true;
            replies.push({ type: "deferUpdate" });
        },
        async showModal(modal) {
            replies.push({ type: "modal", modal: modal.toJSON() });
        },
        async editReply(payload) {
            replies.push({ type: "editReply", payload });
        },
        async followUp(payload) {
            replies.push({ type: "followUp", payload });
        },
    };
}

async function run(customId, options = {}) {
    const requests = [];
    const replies = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        const text = String(url);
        requests.push({ method: init.method, url: text, body: init.body && JSON.parse(init.body) });
        let body = {};
        if (text.includes("/snapshot")) {
            body = snapshotFixture();
        } else if (text.endsWith("/boards?size=500") || text.includes("/boards?")) {
            body = { content: [snapshotFixture().board] };
        } else if (init.method === "POST" && text.endsWith("/boards")) {
            body = { boardId: 7, name: "New one" };
        } else if (init.method === "POST" && text.endsWith("/columns")) {
            body = { columnId: 13, name: "Review" };
        } else if (init.method === "POST" && text.endsWith("/tasks")) {
            body = { taskId: 101, title: "From the board" };
        } else if (text.includes("/comments")) {
            body = { content: [], page: { totalElements: 0, totalPages: 1 } };
        }
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
        await interactionCreate.execute(click(customId, replies, options));
    } finally {
        global.fetch = originalFetch;
    }
    const writes = requests.filter((request) => request.method !== "GET").map((request) =>
        `${request.method} ${request.url.replace("http://localhost:8080/api/servers/999", "")} ${JSON.stringify(request.body ?? null)}`);
    const last = replies.at(-1);
    const text = last?.payload ? JSON.stringify(last.payload.components.map((component) => component.toJSON())) : "";
    return { writes, replies, last, text };
}

test("from the list, a board opens; from a board, forms open for a task, a column and the board", async () => {
    let result = await run("kc1:board:pick", { values: ["1"] });
    assert.match(result.text, /kc1:board:addcol:1/, "the board view");

    for (const [id, title] of [["kc1:board:addtask:1", "New task"], ["kc1:board:addcol:1", "New column"],
        ["kc1:board:edit:1", "Edit board"], ["kc1:board:new", "New board"]]) {
        result = await run(id);
        assert.equal(result.last.type, "modal", id);
        assert.ok(result.last.modal.title.startsWith(title), `${id}: ${result.last.modal.title}`);
    }
    result = await run("kc1:board:addtask:1");
    assert.equal(result.last.modal.components[2].component.custom_id, "column", "the board's form asks which column");

    result = await run("kc1:board:list");
    assert.match(result.text, /kc1:board:pick/, "back to all boards");
});

test("the forms make the change and show the result", async () => {
    let result = await run("kc1:brd:create", { fields: { name: " New one ", description: "" } });
    assert.deepEqual(result.writes, ['POST /boards {"name":"New one","description":null,"serverId":"999"}']);

    result = await run("kc1:brd:column:1", { fields: { name: "Review" } });
    assert.deepEqual(result.writes, ['POST /boards/1/columns {"name":"Review","boardId":1}']);
    assert.match(result.text, /Added column \*\*Review\*\*/);

    result = await run("kc1:brd:task:1", { fields: { title: "From the board", description: "", column: ["11"] } });
    assert.match(result.writes[0], /^POST \/boards\/1\/tasks .*"columnId":11/, "in the column picked on the form");
    assert.match(result.text, /Created \*\*From the board\*\*/);
});

test("a column is moved, renamed, given a new task and deleted from its own view", async () => {
    let result = await run("kc1:col:move:1:10", { values: ["3"] });
    assert.deepEqual(result.writes, ['POST /boards/1/columns/10/move {"index":2}']);
    assert.match(result.text, /Moved \*\*Todo\*\* to position 3/);

    result = await run("kc1:col:rename:1:10");
    assert.equal(result.last.modal.components[0].component.value, "Todo", "the form starts from the current name");
    result = await run("kc1:col:rename:1:10", { fields: { name: "Backlog" } });
    assert.match(result.writes[0], /^PUT \/boards\/1\/columns\/10 .*"name":"Backlog"/);

    result = await run("kc1:col:addtask:1:10");
    assert.equal(result.last.modal.custom_id, "kc1:act:create:1:10", "a task for this column");

    result = await run("kc1:col:ask:1:10");
    assert.match(result.text, /Delete this column\?.*kc1:col:delete:1:10/s, "asks before deleting");
    assert.deepEqual(result.writes, [], "nothing deleted yet");
});

test("comments can be added from the comments, which then show again", async () => {
    let result = await run("kc1:comment:add:1:100");
    assert.equal(result.last.modal.custom_id, "kc1:comment:post:1:100");
    result = await run("kc1:comment:post:1:100", { fields: { content: " Looks good " } });
    assert.deepEqual(result.writes, ['POST /boards/1/tasks/100/comments {"taskId":100,"content":"Looks good"}']);
    assert.match(result.text, /Comments on Task/);
});
