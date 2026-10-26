require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const importer = require("../src/services/boards/taskImport");
const { importPreview } = require("../src/ui/importViews");
const { describeEntry } = require("../src/services/notifications/describe");
const { decode } = require("../src/utils/customId");
const { textLength } = require("./fixtures");

const BOARD = { boardId: 1, serverId: "9", name: "Reading list" };

function plan(tasks, extra = {}) {
    const columns = [...new Set(tasks.map((task) => task.column))].map((name) => ({
        name, created: name === "Plan to read", tasks: tasks.filter((task) => task.column === name).length,
    }));
    return { format: "LIST", headers: [], fields: [], columns, tasks, notes: [], ...extra };
}

test("a file's name says its format; anything else is worked out from the contents", () => {
    assert.equal(importer.formatOfName("books.CSV"), "CSV");
    assert.equal(importer.formatOfName("cells.tsv"), "TSV");
    assert.equal(importer.formatOfName("sprint.kanbancord.json"), "KANBANCORD");
    assert.equal(importer.formatOfName("list.md"), "AUTO");
    assert.equal(importer.formatOfName(undefined), "AUTO");
});

test("the preview lists each column's first tasks, explains what is left out, and is valid for Discord", () => {
    const tasks = [
        ...Array.from({ length: 7 }, (_, i) => ({ title: `Book ${i + 1}`, column: "To read" })),
        { title: "Frieren", column: "Plan to read" },
    ];
    const json = importPreview(BOARD, plan(tasks, { notes: [{ code: "LABEL_UNKNOWN", count: 2, examples: ["Manga"] }] }), "abc123").toJSON();
    const text = JSON.stringify(json);
    assert.ok(text.includes("8 tasks in 2 columns"), text);
    assert.ok(text.includes("Book 3") && !text.includes("Book 4"), "only the first three of a column are listed");
    assert.ok(text.includes("and 4 more"));
    assert.ok(text.includes("*(new column)*"));
    assert.ok(text.includes("2 labels this board does not have, left out. (Manga)"));
    assert.ok(text.includes("Import 8 tasks"));
    assert.ok(textLength(importPreview(BOARD, plan(tasks), "x")) < 4000);
    const ids = text.match(/kc1:[^"]+/g);
    assert.deepEqual(ids.map((id) => [decode(id).feature, decode(id).action]), [["imp", "go"], ["imp", "no"]]);

    const empty = JSON.stringify(importPreview(BOARD, plan([]), "x").toJSON());
    assert.ok(empty.includes("There are no tasks in it to import"));
    assert.ok(empty.includes("\"disabled\":true"), "nothing to import, so Import is off");
});

test("the paste form carries the board, column and choice, and holds Discord's longest text", () => {
    const modal = importer.importModal(1, 12, false).toJSON();
    assert.deepEqual(decode(modal.custom_id).args, ["1", "12", "0"]);
    assert.equal(modal.components[0].component.max_length, importer.FORM_TEXT_MAX);
    assert.deepEqual(decode(importer.importModal(1, null, true).toJSON().custom_id).args, ["1", "0", "1"]);
});

test("only the person who started an import can finish it, and only while it waits", () => {
    const id = importer.remember({ boardId: 1, userId: "555", input: { text: "- One" } });
    assert.equal(importer.waitingImport(id, "555").input.text, "- One");
    assert.throws(() => importer.waitingImport(id, "666"), /Only the person who started this import/);
    importer.forget(id);
    assert.throws(() => importer.waitingImport(id, "555"), /no longer waiting/);
});

test("feeds and the audit channel say how many tasks were imported", () => {
    const entry = { action: "TASKS_IMPORTED", entityType: "BOARD", actorDisplayName: "Mia", changes: { created: { count: 131 } } };
    assert.equal(describeEntry(entry), "**Mia** imported 131 tasks");
});
