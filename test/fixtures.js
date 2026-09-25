/** A board snapshot as the API returns it, with as many tasks as asked for. */
function snapshotFixture({ tasks = 3, features = {}, longText = false } = {}) {
    const long = (text) => (longText ? `${text} ${"x".repeat(300)}` : text);
    const all = { LABELS: true, PRIORITIES: true, ASSIGNEES: true, COMMENTS: true, DUE_DATES: true, PERMISSIONS: true, ...features };
    const columns = [
        { columnId: 10, boardId: 1, name: long("Todo"), position: 1 },
        { columnId: 11, boardId: 1, name: "Doing", position: 2 },
        { columnId: 12, boardId: 1, name: "Done", position: 3 },
    ];
    const list = Array.from({ length: tasks }, (_, index) => ({
        taskId: 100 + index,
        boardId: 1,
        columnId: 10,
        title: long(`Task *${index}*`),
        description: index === 0
            ? "Steps:\n- [ ] one\n- [x] two\n\n![shot](https://i.imgur.com/abc123.png)\n![clip](https://i.imgur.com/vid456.mp4)\n\n![elsewhere](https://example.com/x.png)"
            : long("Plain"),
        position: tasks - index,
        priorityId: 1,
        dueDate: "2030-01-01T09:00:00",
        createdBy: "123456789012345678",
        createdAt: "2026-09-01T10:00:00",
        updatedAt: "2026-09-02T10:00:00",
    }));
    return {
        board: { boardId: 1, serverId: "999", name: long("Sprint"), description: long("The sprint"), isArchived: false },
        columns,
        tasks: list,
        assignments: [{ id: 1, taskId: 100, userId: "223456789012345678" }],
        roleAssignments: [{ id: 2, taskId: 100, roleId: "323456789012345678" }],
        labels: [{ labelId: 5, boardId: 1, name: "Front`end", color: "#3b82f6" }],
        taskLabels: [{ id: 9, taskId: 100, labelId: 5 }],
        priorities: [{ priorityId: 1, boardId: 1, name: "High", color: "#ea580c", position: 2 }],
        permissions: {},
        features: all,
        serverFeatures: all,
    };
}

/** All text a Components V2 message shows, which Discord limits to 4000 characters. */
function textLength(component) {
    const json = typeof component.toJSON === "function" ? component.toJSON() : component;
    let total = typeof json.content === "string" ? json.content.length : 0;
    for (const child of json.components ?? []) {
        total += textLength(child);
    }
    return total;
}

module.exports = { snapshotFixture, textLength };
