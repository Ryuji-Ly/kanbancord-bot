const { request } = require("./httpClient");

/**
 * All board/column/task/comment API calls use the user's JWT via the
 * Authorization header. These are proxied through the backend.
 */

function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}

// ── Boards ────────────────────────────────────────────────────────────────────

function getBoards(token, serverId) {
    return request(`/api/servers/${serverId}/boards`, {
        headers: authHeaders(token),
        query: { userId: null }, // userId resolved server-side from JWT
    });
}

function createBoard(token, serverId, data) {
    return request(`/api/servers/${serverId}/boards`, {
        method: "POST",
        headers: authHeaders(token),
        body: data,
    });
}

// ── Columns ───────────────────────────────────────────────────────────────────

function getColumns(token, boardId) {
    return request(`/api/boards/${boardId}/columns`, {
        headers: authHeaders(token),
    });
}

function createColumn(token, boardId, data) {
    return request(`/api/boards/${boardId}/columns`, {
        method: "POST",
        headers: authHeaders(token),
        body: data,
    });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

function getTasks(token, columnId) {
    return request(`/api/columns/${columnId}/tasks`, {
        headers: authHeaders(token),
    });
}

function createTask(token, columnId, data) {
    return request(`/api/columns/${columnId}/tasks`, {
        method: "POST",
        headers: authHeaders(token),
        body: data,
    });
}

function updateTask(token, taskId, data) {
    return request(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: data,
    });
}

// ── Comments ──────────────────────────────────────────────────────────────────

function getComments(token, taskId) {
    return request(`/api/tasks/${taskId}/comments`, {
        headers: authHeaders(token),
    });
}

function createComment(token, taskId, data) {
    return request(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: authHeaders(token),
        body: data,
    });
}

module.exports = {
    getBoards,
    createBoard,
    getColumns,
    createColumn,
    getTasks,
    createTask,
    updateTask,
    getComments,
    createComment,
};
