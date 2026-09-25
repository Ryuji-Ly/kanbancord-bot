require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Collection, MessageFlags } = require("discord.js");

const { snapshotFixture, textLength } = require("./fixtures");
const { parseServerTime, describeMarkdown, fitLines, plain } = require("../src/utils/format");
const { resolveByIdOrName, autocompleteChoices, snapshotModel } = require("../src/services/boards/boardData");
const { buildBoardOverview, buildColumnView, buildBoardList } = require("../src/ui/boardViews");
const { buildTaskView } = require("../src/ui/taskViews");
const { buildCommentPage } = require("../src/ui/commentViews");
const { buildHelp, buildHelpDetail, helpChoices, listEntries, usageOf } = require("../src/services/help/helpService");
const { decode } = require("../src/utils/customId");

function loadCommands() {
    const commands = new Collection();
    const dir = path.join(__dirname, "..", "src", "commands");
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
        const command = require(path.join(dir, file));
        commands.set(command.data.name, command);
    }
    return commands;
}

test("every command and subcommand explains itself for /help", () => {
    const commands = loadCommands();
    for (const [name, command] of commands) {
        assert.ok(command.info?.description, `/${name} has info.description`);
    }
    for (const entry of listEntries(commands)) {
        assert.ok(entry.info.description, `/${entry.path} has a description in info`);
        for (const example of entry.info.examples ?? []) {
            assert.ok(example.startsWith(`/${entry.path}`), `example "${example}" is for /${entry.path}`);
        }
        const detail = buildHelpDetail(commands, entry.path);
        assert.ok(textLength(detail) < 4000);
    }
    assert.ok(textLength(buildHelp(commands)) < 4000);
});

test("usage lines come from the options: <required> and [optional]", () => {
    const commands = loadCommands();
    const byPath = new Map(listEntries(commands).map((entry) => [entry.path, entry]));
    assert.equal(usageOf(byPath.get("task view")), "/task view <board> <task>");
    assert.equal(usageOf(byPath.get("help")), "/help [command]");
    assert.equal(usageOf(byPath.get("report")), "/report <type>");
    assert.ok(JSON.stringify(buildHelpDetail(commands, "/Board  View").toJSON()).includes("/board view <board>"));
    assert.ok(JSON.stringify(buildHelpDetail(commands, "board").toJSON()).includes("/board list"));
    assert.throws(() => buildHelpDetail(commands, "nope"), /There is no \/nope/);
    assert.deepEqual(helpChoices(commands, "board").map((choice) => choice.value), ["board", "board list", "board view"]);
});

test("formatting: server times are UTC, descriptions lose their media to a gallery, text is budgeted", () => {
    assert.equal(parseServerTime("2030-01-01T09:00:00").toISOString(), "2030-01-01T09:00:00.000Z");
    assert.equal(parseServerTime("2030-01-01T09:00:00+02:00").toISOString(), "2030-01-01T07:00:00.000Z");
    assert.equal(parseServerTime(null), null);

    const { text, media } = describeMarkdown(snapshotFixture().tasks[0].description, 1000);
    assert.deepEqual(media.map((item) => item.url), ["https://i.imgur.com/abc123.png", "https://i.imgur.com/vid456.mp4"]);
    assert.ok(text.includes("- ☐ one") && text.includes("- ☑ two"));
    assert.ok(text.includes("https://example.com/x.png"), "only Imgur media moves to the gallery");

    assert.deepEqual(fitLines(["aaa", "bbb", "ccc"], 7), { shown: ["aaa", "bbb"], omitted: 1 });
    assert.equal(plain("**bold** _x_"), "\\*\\*bold\\*\\* \\_x\\_");
});

test("boards and tasks are found by id, by exact name, or by a unique beginning", () => {
    const items = [{ id: 1, name: "Sprint" }, { id: 2, name: "Sprint 2" }, { id: 3, name: "Backlog" }];
    const find = (input) => resolveByIdOrName(items, input, (item) => item.id, (item) => item.name, "board");
    assert.equal(find("3").name, "Backlog");
    assert.equal(find("sprint").id, 1, "an exact name wins over longer names");
    assert.equal(find("back").id, 3);
    assert.throws(() => find("spr"), /More than one board/);
    assert.throws(() => find("zzz"), /No board you can see/);

    const choices = autocompleteChoices(items, "log", (item) => ({ name: item.name, value: String(item.id) }), (item) => item.name);
    assert.deepEqual(choices, [{ name: "Backlog", value: "3" }]);
});

test("features switched off for the board are not shown", () => {
    const model = snapshotModel(snapshotFixture({ features: { LABELS: false, PRIORITIES: false, ASSIGNEES: false } }));
    const task = model.task(100);
    assert.equal(model.priorityOf(task), null);
    assert.deepEqual(model.labelsOf(task), []);
    assert.deepEqual(model.assigneesOf(task), []);
    const view = JSON.stringify(buildTaskView(model, task).toJSON());
    assert.ok(!view.includes("High") && !view.includes("Front") && !view.includes("Assigned"));
});

test("every view stays within Discord's limits, however big the board", () => {
    const big = snapshotModel(snapshotFixture({ tasks: 80, longText: true }));
    for (const view of [
        buildBoardOverview(big),
        buildColumnView(big, 10, 0),
        buildColumnView(big, 10, 7),
        buildTaskView(big, big.task(100)),
        buildBoardList(Array.from({ length: 60 }, (_, index) => ({ ...big.board, boardId: index, name: `Board ${index} ${"y".repeat(90)}` }))),
    ]) {
        const json = view.toJSON();
        assert.ok(textLength(json) <= 4000, `text is ${textLength(json)} characters`);
        for (const row of json.components.filter((component) => component.type === 1)) {
            for (const item of row.components) {
                if (item.custom_id) {
                    assert.ok(decode(item.custom_id)?.current, item.custom_id);
                    assert.ok(item.custom_id.length <= 100);
                }
                for (const option of item.options ?? []) {
                    assert.ok(option.label.length <= 100);
                }
            }
        }
    }
    const lastPage = JSON.stringify(buildColumnView(big, 10, 99).toJSON());
    assert.ok(lastPage.includes("page 8 of 8"), "pages past the end show the last page");
});

test("the task view shows fields, a gallery of its Imgur media, and a link to the task", () => {
    const model = snapshotModel(snapshotFixture());
    const json = buildTaskView(model, model.task(100)).toJSON();
    const text = JSON.stringify(json);
    assert.ok(text.includes("**Priority** High"));
    assert.ok(text.includes("`Front'end`"), "backticks cannot break out of the label's code span");
    assert.ok(text.includes("<@223456789012345678>") && text.includes("<@&323456789012345678>"));
    assert.ok(text.includes("<t:1893488400:f>"), "due date as a Discord timestamp, in UTC");
    const gallery = json.components.find((component) => component.type === 12);
    assert.deepEqual(gallery.items.map((item) => item.media.url), ["https://i.imgur.com/abc123.png", "https://i.imgur.com/vid456.mp4"]);
    assert.ok(text.includes("https://kanbancord.com/boards/1?serverId=999&task=100"));
});

test("comment pages show authors by name and page newest first", () => {
    const model = snapshotModel(snapshotFixture());
    const view = buildCommentPage({
        board: model.board,
        task: model.task(100),
        comments: [{ commentId: 1, authorGlobalName: "Mia *", content: "Looks good ![p](https://i.imgur.com/p1.png)", createdAt: "2026-09-03T10:00:00", updatedAt: "2026-09-03T10:00:00" }],
        page: 0,
        pages: 3,
        total: 11,
    }).toJSON();
    const text = JSON.stringify(view);
    assert.ok(text.includes("**Mia \\\\***"), "names are escaped");
    assert.ok(text.includes("page 1 of 3") && text.includes("1 image or video"));
});

test("/board view runs as the user who asked, and replies only to them", async () => {
    const interactionCreate = require("../src/events/interactionCreate");
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        calls.push({ url: String(url), headers: init.headers });
        const body = String(url).includes("/snapshot") ? snapshotFixture() : { content: [snapshotFixture().board] };
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    const replies = [];
    const commands = loadCommands();
    const interaction = {
        commandName: "board",
        user: { id: "555" },
        guildId: "999",
        deferred: false,
        replied: false,
        client: { commands },
        options: { getSubcommand: () => "view", getString: () => "Sprint", getSubcommand_: null },
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        isRepliable: () => true,
        async deferReply(options) {
            this.deferred = true;
            replies.push({ type: "defer", options });
        },
        async editReply(payload) {
            replies.push({ type: "edit", payload });
        },
        async followUp(payload) {
            replies.push({ type: "followUp", payload });
        },
    };
    try {
        await interactionCreate.execute(interaction, { commands });
    } finally {
        global.fetch = originalFetch;
    }

    assert.equal(replies[0].options.flags, MessageFlags.Ephemeral);
    assert.equal(replies.at(-1).type, "edit", JSON.stringify(replies.at(-1)));
    assert.ok(JSON.stringify(replies.at(-1).payload.components[0].toJSON()).includes("Sprint"));
    for (const call of calls) {
        assert.ok(call.url.startsWith("http://localhost:8080/api/servers/999/"), call.url);
        assert.equal(call.headers["X-Acting-User-Id"], "555");
        assert.equal(call.headers["X-Acting-Guild-Id"], "999");
        assert.equal(call.headers["X-Internal-Bot-Token"], "test-sync-token");
    }
});
