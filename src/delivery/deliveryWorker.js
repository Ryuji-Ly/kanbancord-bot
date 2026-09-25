const { claimPlans, reportDelivered, reportFailed } = require("../api/notificationApi");
const logger = require("../utils/logger");
const { deliverPlan, discordSenders } = require("./deliverPlan");

/**
 * Collects due notifications from KanbanCord and delivers them, on one shard only. Asks again at
 * once while there is more to do, every few seconds when there is not, and backs off while
 * KanbanCord cannot be reached.
 */

const IDLE_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
const BATCH = 20;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One round: claim, deliver, report. Returns how many plans it handled. */
async function runOnce(senders, api = { claimPlans, reportDelivered, reportFailed }) {
    const plans = await api.claimPlans(BATCH);
    for (const plan of plans) {
        let retry = false;
        try {
            ({ retry } = await deliverPlan(plan, senders));
        } catch (error) {
            logger.error(`[Delivery] Batch ${plan.batchId} failed: ${error.stack ?? error.message}`);
            retry = true;
        }
        await (retry ? api.reportFailed(plan.batchId) : api.reportDelivered(plan.batchId)).catch((error) =>
            logger.warn(`[Delivery] Could not report batch ${plan.batchId}: ${error.message}`));
    }
    return plans.length;
}

function startDeliveryWorker(client, { sleep = wait } = {}) {
    const senders = discordSenders(client);
    let stopped = false;
    let backoff = IDLE_MS;

    (async () => {
        logger.info("[Delivery] Delivering notifications");
        while (!stopped) {
            try {
                const handled = await runOnce(senders);
                backoff = IDLE_MS;
                if (handled < BATCH) {
                    await sleep(IDLE_MS);
                }
            } catch (error) {
                logger.warn(`[Delivery] Could not collect notifications: ${error.message}`);
                await sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
            }
        }
    })();

    return () => {
        stopped = true;
    };
}

module.exports = { runOnce, startDeliveryWorker };
