/**
 * What can be done on a board: the switched-on features, and whether the board is archived. With
 * `forUser`, also the permissions of whoever loaded it, the same way the website decides what to
 * show. Discord views are shared by the channel, so they leave that out and offer everything the
 * board allows; the API checks each change as whoever makes it.
 */

const FEATURE_OF = {
    ASSIGN_TASK_SELF: "ASSIGNEES",
    ASSIGN_TASK_OTHERS: "ASSIGNEES",
    CREATE_TASK_COMMENT: "COMMENTS",
    APPLY_LABEL_TO_TASK: "LABELS",
    REMOVE_LABEL_FROM_TASK: "LABELS",
};

function abilitiesOf(snapshot, { forUser = true } = {}) {
    const archived = !snapshot || snapshot.board.isArchived;
    const features = snapshot?.features ?? {};
    const allowed = (key) => {
        if (!forUser) {
            return true;
        }
        const decision = snapshot?.permissions?.[key];
        return typeof decision === "boolean" ? decision : Boolean(decision?.allowed);
    };
    const can = (key) => !archived && allowed(key) && (FEATURE_OF[key] === undefined || Boolean(features[FEATURE_OF[key]]));

    return {
        createTask: can("CREATE_TASK"),
        editTask: can("EDIT_TASK"),
        moveTask: can("MOVE_TASK"),
        deleteTask: can("DELETE_TASK"),
        assignSelf: can("ASSIGN_TASK_SELF"),
        assignOthers: can("ASSIGN_TASK_OTHERS"),
        comment: can("CREATE_TASK_COMMENT"),
        applyLabel: can("APPLY_LABEL_TO_TASK"),
        removeLabel: can("REMOVE_LABEL_FROM_TASK"),
        setPriority: can("EDIT_TASK") && Boolean(features.PRIORITIES),
        setDue: can("EDIT_TASK") && Boolean(features.DUE_DATES),
        createColumn: can("CREATE_COLUMN"),
        editColumn: can("EDIT_COLUMN"),
        moveColumn: can("MOVE_COLUMN"),
        deleteColumn: can("DELETE_COLUMN"),
    };
}

module.exports = { abilitiesOf };
