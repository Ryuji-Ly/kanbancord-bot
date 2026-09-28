const { internalSyncToken } = require("../config/env");
const { request } = require("./httpClient");

/**
 * Board posts that need redrawing, the whole boards to draw them from, and reporting back. Posts are
 * registered by the user who posts them, through their own API client (see services/boards/boardPosts.js).
 */

function headers() {
    if (!internalSyncToken) {
        throw new Error("KANBANCORD_INTERNAL_SYNC_TOKEN is required to update board posts");
    }
    return { "X-Internal-Bot-Token": internalSyncToken };
}

/** Up to `limit` posts to redraw now; an empty list means none. */
async function claimPosts(limit = 20) {
    const posts = await request("/api/internal/board-posts/claim", { method: "POST", query: { limit }, headers: headers() });
    return Array.isArray(posts) ? posts : [];
}

/** The whole board, whoever is looking: a post shows everything on it. */
function postSnapshot(serverId, boardId) {
    return request("/api/internal/board-posts/snapshot", { query: { serverId, boardId }, headers: headers() });
}

/**
 * @param {{ done?: string[], gone?: string[], retry?: string[] }} outcome redrawn; gone for good
 *   (removed); or to try again later
 */
function reportPosts({ done = [], gone = [], retry = [] }) {
    return request("/api/internal/board-posts/report", { method: "POST", headers: headers(), body: { done, gone, retry } });
}

module.exports = { claimPosts, postSnapshot, reportPosts };
