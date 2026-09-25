const { request } = require("../../api/httpClient");
const logger = require("../../utils/logger");
const { runStartupSync } = require("./startupSync");

/**
 * When the full sync of servers, roles and members runs: once the API answers (it may still be
 * starting when the bot does), then again every few hours to catch changes whose events were missed
 * while the API was down. A run with failures is retried sooner.
 */

const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
/** How long to wait for the API before giving up on this attempt and trying again later. */
const MAX_WAIT_MS = 10 * 60_000;
const RESYNC_EVERY_MS = 12 * 60 * 60_000;
const RETRY_FAILED_AFTER_MS = 5 * 60_000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiIsUp() {
    try {
        const health = await request("/actuator/health");
        return health?.status === "UP";
    } catch {
        return false;
    }
}

/**
 * Resolves true once the API answers, or false after `maxWaitMs`. Waits twice as long after each
 * failed try, up to a minute.
 */
async function waitForApi({ maxWaitMs = MAX_WAIT_MS, check = apiIsUp, sleep = wait, now = Date.now } = {}) {
    const started = now();
    let delay = FIRST_RETRY_MS;
    let attempts = 0;
    while (true) {
        attempts++;
        if (await check()) {
            if (attempts > 1) {
                logger.info(`[Sync] KanbanCord is reachable after ${attempts} tries`);
            }
            return true;
        }
        if (attempts === 1) {
            logger.warn("[Sync] KanbanCord is not reachable yet; waiting before syncing");
        }
        if (now() - started + delay > maxWaitMs) {
            return false;
        }
        await sleep(delay);
        delay = Math.min(delay * 2, MAX_RETRY_MS);
    }
}

/**
 * Runs the sync now (once the API is up) and keeps it scheduled. Returns a function that stops the
 * schedule, for tests.
 */
function startSyncSchedule(client, { sync = runStartupSync, ready = waitForApi, sleep = wait } = {}) {
    let stopped = false;

    (async () => {
        while (!stopped) {
            let next = RESYNC_EVERY_MS;
            try {
                if (await ready()) {
                    const results = await sync(client);
                    if (results && results.failed > 0) {
                        next = RETRY_FAILED_AFTER_MS;
                    }
                } else {
                    logger.error(`[Sync] KanbanCord was not reachable for ${MAX_WAIT_MS / 60_000} minutes; trying again later`);
                    next = RETRY_FAILED_AFTER_MS;
                }
            } catch (error) {
                logger.error(`[Sync] Unexpected error: ${error.stack ?? error.message}`);
                next = RETRY_FAILED_AFTER_MS;
            }
            if (!stopped) {
                await sleep(next);
            }
        }
    })();

    return () => {
        stopped = true;
    };
}

module.exports = { waitForApi, startSyncSchedule };
