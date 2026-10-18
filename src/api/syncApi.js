const { internalSyncToken } = require("../config/env");
const { request } = require("./httpClient");

function requireSyncToken() {
    if (!internalSyncToken) {
        throw new Error("KANBANCORD_INTERNAL_SYNC_TOKEN is required for internal sync calls");
    }

    return internalSyncToken;
}

function syncHeaders() {
    return {
        "X-Internal-Bot-Token": requireSyncToken(),
    };
}

/**
 * Servers with a change the API may have missed: a member or role event that could not be sent.
 * Their next sync is sent whole, without asking whether anything changed.
 */
const missedChanges = new Set();

/** Sends one change to a server; if it fails, the server's next sync is sent whole. */
async function change(serverId, send) {
    try {
        return await send();
    } catch (error) {
        missedChanges.add(String(serverId));
        throw error;
    }
}

/** Whether a change to the server may have been missed since its last full sync; asking clears it. */
function takeMissedChanges(serverId) {
    return missedChanges.delete(String(serverId));
}

/** Marks the server for a whole sync next time, such as after a whole sync that failed. */
function markMissedChanges(serverId) {
    missedChanges.add(String(serverId));
}

function upsertServer({ serverId, data }) {
    return change(serverId, () => request(`/api/internal/sync/servers/${serverId}`, {
        method: "PUT",
        headers: syncHeaders(),
        body: data,
    }));
}

function upsertRole({ serverId, roleId, data }) {
    return change(serverId, () => request(`/api/internal/sync/servers/${serverId}/roles/${roleId}`, {
        method: "PUT",
        headers: syncHeaders(),
        body: data,
    }));
}

function upsertMember({ serverId, userId, data }) {
    return change(serverId, () => request(`/api/internal/sync/servers/${serverId}/members/${userId}`, {
        method: "PUT",
        headers: syncHeaders(),
        body: data,
    }));
}

/**
 * Whether the server is as it was at its last full sync, by its fingerprint: then it need not be
 * sent whole. The API says no at least once a day, and for servers it does not know.
 */
async function serverUnchanged({ serverId, fingerprint }) {
    try {
        const answer = await request(`/api/internal/sync/servers/${serverId}/fingerprint`, {
            method: "POST",
            headers: syncHeaders(),
            body: { fingerprint },
        });
        return Boolean(answer?.unchanged);
    } catch {
        // Not answered (an older API, say): send the server whole.
        return false;
    }
}

/** A whole server at once: for large servers this takes a while, so it may take up to three minutes. */
function bootstrapServer({ serverId, data }) {
    return request(`/api/internal/sync/servers/${serverId}/bootstrap`, {
        method: "POST",
        headers: syncHeaders(),
        body: data,
        timeoutMs: 180_000,
    });
}

/**
 * Returns the list of server IDs already known to the backend.
 * @returns {Promise<Set<string>>}
 */
async function listKnownServerIds() {
    const ids = await request("/api/internal/sync/servers", {
        method: "GET",
        headers: syncHeaders(),
    });

    return new Set(Array.isArray(ids) ? ids : []);
}

/**
 * Board and task totals, across the servers the bot is in, for its status.
 * @returns {Promise<{ boards: number, tasks: number }>}
 */
function fetchBotStats() {
    return request("/api/internal/stats", {
        method: "GET",
        headers: syncHeaders(),
    });
}

/**
 * Replaces all role assignments for a member.
 * @param {{ serverId: string, userId: string, roleIds: string[] }} param
 */
function syncMemberRoles({ serverId, userId, roleIds }) {
    return change(serverId, () => request(`/api/internal/sync/servers/${serverId}/members/${userId}/roles`, {
        method: "PUT",
        headers: syncHeaders(),
        body: { roleIds: roleIds.map((id) => String(id)) },
    }));
}

function deleteRole({ serverId, roleId }) {
    return change(serverId, () => request(`/api/internal/sync/servers/${serverId}/roles/${roleId}`, {
        method: "DELETE",
        headers: syncHeaders(),
    }));
}

function deleteMember({ serverId, userId }) {
    return change(serverId, () => request(`/api/internal/sync/servers/${serverId}/members/${userId}`, {
        method: "DELETE",
        headers: syncHeaders(),
    }));
}

/** The server's text channels, complete: channels left out are removed. */
function replaceChannels({ serverId, channels }) {
    return request(`/api/internal/sync/servers/${serverId}/channels`, {
        method: "PUT",
        headers: syncHeaders(),
        body: channels,
    });
}

function markServerNotPresent({ serverId }) {
    return request(`/api/internal/sync/servers/${serverId}/presence`, {
        method: "DELETE",
        headers: syncHeaders(),
    });
}

module.exports = {
    upsertServer,
    upsertRole,
    upsertMember,
    bootstrapServer,
    serverUnchanged,
    takeMissedChanges,
    markMissedChanges,
    listKnownServerIds,
    fetchBotStats,
    syncMemberRoles,
    deleteRole,
    deleteMember,
    markServerNotPresent,
    replaceChannels,
};
