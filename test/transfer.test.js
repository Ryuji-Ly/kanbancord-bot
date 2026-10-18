require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { exportParts, partsInFile } = require("../src/services/boards/transfer");
const { buildExportView, buildImportView } = require("../src/ui/transferViews");
const { textLength } = require("./fixtures");

/** Options as Discord gives them: null for one left out. */
const options = (values = {}) => ({ getBoolean: (name) => (name in values ? values[name] : null) });

test("/board export includes the parts the board uses, and its rules only for those who may edit them", () => {
    const snapshot = {
        features: { LABELS: true, PRIORITIES: false, ASSIGNEES: true, COMMENTS: true, PERMISSIONS: true },
        permissions: { EDIT_BOARD_PERMISSIONS: { allowed: false } },
    };
    assert.deepEqual(exportParts(options(), snapshot), ["labels", "assignees", "comments"]);
    assert.deepEqual(exportParts(options({ comments: false, priorities: true }), snapshot), ["labels", "priorities", "assignees"],
        "options win over the defaults");
    const editor = { ...snapshot, permissions: { EDIT_BOARD_PERMISSIONS: { allowed: true } } };
    assert.ok(exportParts(options(), editor).includes("permissions"));
});

test("/board import reads which parts a file has", () => {
    assert.deepEqual(partsInFile({ tasks: [{ comments: [] }], labels: [], permissions: [] }), ["labels", "comments", "permissions"]);
    assert.deepEqual(partsInFile({ tasks: [{ roles: [] }] }), ["assignees"]);
    assert.deepEqual(partsInFile({ tasks: [] }), []);
});

test("the export attaches the file, and the import says what was left out", () => {
    const exported = buildExportView({
        board: { boardId: 1, serverId: "9", name: "Sprint" },
        file: { columns: [1, 2], tasks: [1, 2, 3] },
        name: "Sprint.kanbancord.json",
        parts: [{ label: "Labels" }],
    }).toJSON();
    assert.ok(JSON.stringify(exported).includes("attachment://Sprint.kanbancord.json"));
    assert.ok(JSON.stringify(exported).includes("2 columns and 3 tasks, with labels"));

    const imported = JSON.stringify(buildImportView({
        board: { boardId: 2, serverId: "9", name: "Sprint (2)" },
        imported: { columns: 2, tasks: 3, assignees: 0 },
        skipped: { roles: 2 },
    }).toJSON());
    assert.ok(imported.includes("Created with 2 columns, 3 tasks."));
    assert.ok(imported.includes("2 role assignments left out"));
    assert.ok(!imported.includes("assignees left out"));
    assert.ok(textLength(JSON.parse(imported)) < 4000);
});
