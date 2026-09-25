const { apiBaseUrl } = require("../config/env");

/** How long a single API call may take before it counts as unreachable. */
const TIMEOUT_MS = 15_000;

/**
 * A failed API call. `status` is the HTTP status, or 0 when the API could not be reached at all;
 * `message` is the API's own explanation when it gave one.
 */
class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

function withQuery(path, query = {}) {
    const url = new URL(path, apiBaseUrl);
    Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

async function parseResponseBody(response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        return response.json();
    }

    return response.text();
}

async function request(path, { method = "GET", query, body, headers = {} } = {}) {
    let response;
    try {
        response = await fetch(withQuery(path, query), {
            method,
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (error) {
        throw new ApiError(`KanbanCord could not be reached: ${error.message}`, 0, null);
    }

    const payload = await parseResponseBody(response);

    if (!response.ok) {
        let message = `API request failed (${response.status})`;
        if (typeof payload === "string" && payload.trim()) {
            message = payload;
        } else if (payload && typeof payload === "object") {
            message = payload.message || payload.error || message;
        }

        throw new ApiError(message, response.status, payload);
    }

    return payload;
}

module.exports = { request, ApiError };
