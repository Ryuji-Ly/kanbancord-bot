const { internalSyncToken } = require("../config/env");
const { request } = require("./httpClient");

/**
 * The KanbanCord API as a particular Discord user, from a command they ran in a server. The API
 * checks this user's permissions exactly as it would on the website; the bot decides nothing
 * itself. Only paths under `/api/servers/{guildId}` for that same server are allowed.
 *
 * @param {{ userId: string, guildId: string }} actor
 */
function forUser({ userId, guildId }) {
    if (!internalSyncToken) {
        throw new Error("KANBANCORD_INTERNAL_SYNC_TOKEN is required to act for users");
    }
    const headers = {
        "X-Internal-Bot-Token": internalSyncToken,
        "X-Acting-User-Id": String(userId),
        "X-Acting-Guild-Id": String(guildId),
    };
    const serverPath = (path) => `/api/servers/${guildId}${path}`;
    const call = (method) => (path, options = {}) =>
        request(serverPath(path), { ...options, method, headers: { ...headers, ...options.headers } });

    return {
        get: call("GET"),
        post: call("POST"),
        put: call("PUT"),
        patch: call("PATCH"),
        delete: call("DELETE"),
    };
}

module.exports = { forUser };
