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

function upsertServer({ serverId, data }) {
    return request(`/api/internal/sync/servers/${serverId}`, {
        method: "PUT",
        headers: syncHeaders(),
        body: data,
    });
}

function upsertRole({ serverId, roleId, data }) {
    return request(`/api/internal/sync/servers/${serverId}/roles/${roleId}`, {
        method: "PUT",
        headers: syncHeaders(),
        body: data,
    });
}

function upsertMember({ serverId, userId, data }) {
    return request(`/api/internal/sync/servers/${serverId}/members/${userId}`, {
        method: "PUT",
        headers: syncHeaders(),
        body: data,
    });
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
 * Replaces all role assignments for a member.
 * @param {{ serverId: string, userId: string, roleIds: string[] }} param
 */
function syncMemberRoles({ serverId, userId, roleIds }) {
    return request(`/api/internal/sync/servers/${serverId}/members/${userId}/roles`, {
        method: "PUT",
        headers: syncHeaders(),
        body: { roleIds: roleIds.map((id) => String(id)) },
    });
}

function deleteRole({ serverId, roleId }) {
    return request(`/api/internal/sync/servers/${serverId}/roles/${roleId}`, {
        method: "DELETE",
        headers: syncHeaders(),
    });
}

function deleteMember({ serverId, userId }) {
    return request(`/api/internal/sync/servers/${serverId}/members/${userId}`, {
        method: "DELETE",
        headers: syncHeaders(),
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
    listKnownServerIds,
    syncMemberRoles,
    deleteRole,
    deleteMember,
    markServerNotPresent,
};
