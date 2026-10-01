const { internalSyncToken } = require("../config/env");
const { request } = require("./httpClient");

/**
 * The notification queue: what to deliver, and reporting back. Each plan names the channels to post
 * in (with whom to mention) and the people to message directly.
 */

function headers() {
    if (!internalSyncToken) {
        throw new Error("KANBANCORD_INTERNAL_SYNC_TOKEN is required to deliver notifications");
    }
    return { "X-Internal-Bot-Token": internalSyncToken };
}

/** Up to `limit` plans that are due; an empty list means nothing is due. */
async function claimPlans(limit = 20) {
    const plans = await request("/api/internal/notifications/claim", { method: "POST", query: { limit }, headers: headers() });
    return Array.isArray(plans) ? plans : [];
}

function reportDelivered(batchId) {
    return request(`/api/internal/notifications/${batchId}/delivered`, { method: "POST", headers: headers() });
}

/** Nothing could be delivered this time; the API tries again later. */
function reportFailed(batchId) {
    return request(`/api/internal/notifications/${batchId}/failed`, { method: "POST", headers: headers() });
}

/** The thread the bot made for a task, or `gone: true` when it found that thread deleted. */
function reportThread({ serverId, taskId, channelId, threadId, privateThread = false, gone = false }) {
    return request("/api/internal/notifications/threads", {
        method: "POST",
        headers: headers(),
        body: { serverId, taskId: Number(taskId), channelId, threadId, privateThread, gone },
    });
}

module.exports = { claimPlans, reportDelivered, reportFailed, reportThread };
