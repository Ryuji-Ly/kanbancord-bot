const { Status } = require("discord.js");
const { statusHeartbeatUrl } = require("../../config/env");
const logger = require("../../utils/logger");

/**
 * Tells the public status page the bot is up: a request to its heartbeat address every minute, but
 * only while every shard is connected to Discord. When the heartbeats stop (the bot, its container or
 * the whole server is down, or Discord cannot be reached) the status page shows the bot as down.
 * Nothing is sent without KANBANCORD_STATUS_HEARTBEAT_URL.
 */

const EVERY_MS = 60_000;
const TIMEOUT_MS = 10_000;

/** Whether the bot is connected to Discord, on every shard. */
async function connected(client) {
    if (!client.shard) {
        return client.ws.status === Status.Ready;
    }
    const statuses = await client.shard.fetchClientValues("ws.status");
    return statuses.every((status) => status === Status.Ready);
}

/** One heartbeat, if the bot is connected. Returns whether one was sent. */
async function beat(client, { url = statusHeartbeatUrl, send = fetch } = {}) {
    if (!url || !(await connected(client))) {
        return false;
    }
    const response = await send(url, { method: "GET", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return true;
}

/** Starts the heartbeats, if an address is set. Call once, on the shard that runs the background work. */
function startHeartbeat(client) {
    if (!statusHeartbeatUrl) {
        return () => {};
    }
    const run = () => beat(client).catch((error) => logger.warn(`[Status] Could not send a heartbeat: ${error.message}`));
    run();
    const timer = setInterval(run, EVERY_MS);
    return () => clearInterval(timer);
}

module.exports = { beat, startHeartbeat };
