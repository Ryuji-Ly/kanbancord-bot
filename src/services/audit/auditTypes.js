/** The kinds of change to filter by, as on the website, each with the entity types it covers. */
const AUDIT_TYPES = {
    tasks: { label: "Tasks", entityTypes: ["TASK"] },
    assignments: { label: "Assignments", entityTypes: ["TASK_ASSIGNMENT"] },
    comments: { label: "Comments", entityTypes: ["TASK_COMMENT"] },
    columns: { label: "Columns", entityTypes: ["BOARD_COLUMN"] },
    boards: { label: "Boards", entityTypes: ["BOARD"] },
    labels: { label: "Labels", entityTypes: ["LABEL", "TASK_LABEL"] },
    priorities: { label: "Priorities", entityTypes: ["PRIORITY"] },
    permissions: { label: "Permissions", entityTypes: ["PERMISSION"] },
    settings: { label: "Settings", entityTypes: ["SETTINGS"] },
};

module.exports = { AUDIT_TYPES };
