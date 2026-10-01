/**
 * What this server has done so far, for the guide's ticks: one answer from KanbanCord, as the user
 * (boards and tasks they cannot see do not count), plus which features are on, which the steps
 * mention. Each part is best-effort: what fails is left out, and its step is simply not ticked.
 */

/** @returns {Promise<import("../../ui/guideViews").GuideState>} */
async function guideState(ctx) {
    const [features, progress] = await Promise.allSettled([ctx.api.get("/features"), ctx.api.get("/guide")]);
    const state = {};
    if (features.status === "fulfilled" && features.value) {
        state.features = features.value;
    }
    if (progress.status === "fulfilled" && progress.value) {
        const done = progress.value;
        Object.assign(state, {
            boards: done.boards,
            columns: done.columns,
            tasks: done.tasks,
            taskDetails: done.taskDetails,
            updates: done.updates,
            notifications: done.notifications,
        });
    }
    return state;
}

module.exports = { guideState };
