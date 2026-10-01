const logger = require("../utils/logger");

/**
 * A task's thread in a feed channel, for boards with threads on. The plan says which channel, whether
 * the task has a thread yet, and where updates go once it does (BOTH, THREAD or CHANNEL). The thread
 * is made when something first happens to the task: from the feed's post when there is one (public
 * threads), otherwise on its own with the task in it. It follows the task's title, takes in its
 * creator and assignees when private, and is archived when the task is deleted or archived.
 */

const NAME_MAX = 100;
const UNKNOWN_CHANNEL = 10003;
/** Assignment changes are when a private thread's members change. */
const ASSIGNING = new Set(["TASK_ASSIGNMENT_CREATED", "TASK_CREATED"]);

/**
 * Threads made recently, by task: plans are claimed in groups, so a second plan for the same task may
 * arrive before the API knows about the thread made for the first.
 */
const recent = new Map();
const RECENT_MAX = 500;

function remember(taskId, channelId, threadId) {
    recent.delete(String(taskId));
    recent.set(String(taskId), { channelId, threadId });
    while (recent.size > RECENT_MAX) {
        recent.delete(recent.keys().next().value);
    }
}

function threadName(plan) {
    const name = String(plan.thread.name ?? plan.task?.title ?? `Task ${plan.task?.taskId}`).replace(/\s+/g, " ").trim();
    return (name || "Task").slice(0, NAME_MAX);
}

/** The same post without pinging anyone: the channel post already did. */
function silent(payload) {
    return { ...payload, allowedMentions: { parse: [] } };
}

/**
 * Delivers the plan's post for the thread's channel (null when the feed has nothing to post there)
 * and looks after the thread. Returns the deliveries that reached people, for working out who was
 * already mentioned.
 *
 * @param {(what: string, send: () => Promise<unknown>) => Promise<boolean>} attempt
 */
async function deliverWithThread(plan, delivery, payload, senders, attempt) {
    const thread = plan.thread;
    const reached = [];
    const known = thread.threadId ?? (recent.get(String(plan.task.taskId))?.channelId === thread.channelId
        ? recent.get(String(plan.task.taskId)).threadId : null);
    const what = `thread for task ${plan.task.taskId} (batch ${plan.batchId})`;

    if (!known) {
        if (thread.close) {
            if (payload && await attempt(`channel ${delivery.channelId} (batch ${plan.batchId})`,
                () => senders.sendToChannel(delivery.channelId, payload))) {
                reached.push(delivery);
            }
            return reached;
        }
        let message = null;
        if (payload) {
            await attempt(`channel ${delivery.channelId} (batch ${plan.batchId})`, async () => {
                message = await senders.sendToChannel(delivery.channelId, payload);
            });
            if (message) {
                reached.push(delivery);
            }
        }
        await createThread(plan, message, senders, what);
        return reached;
    }

    let threadId = known;
    if (payload) {
        const toChannel = thread.updates !== "THREAD";
        const toThread = thread.updates !== "CHANNEL";
        if (toChannel && await attempt(`channel ${delivery.channelId} (batch ${plan.batchId})`,
            () => senders.sendToChannel(delivery.channelId, payload))) {
            reached.push(delivery);
        }
        if (toThread) {
            const posted = await postInThread(plan, threadId, toChannel ? silent(payload) : payload, senders);
            if (posted === "gone") {
                threadId = null;
                // Its updates were for the thread only: the channel gets them after all.
                if (!toChannel && await attempt(`channel ${delivery.channelId} (batch ${plan.batchId})`,
                    () => senders.sendToChannel(delivery.channelId, payload))) {
                    reached.push(delivery);
                }
            } else if (posted && !toChannel) {
                // Who can see the thread is judged by its channel.
                reached.push(delivery);
            }
        }
    }
    if (threadId) {
        await keepUp(plan, threadId, senders, what);
    }
    return reached;
}

/** Posts in the thread: true, false (failed), or "gone" when the thread no longer exists. */
async function postInThread(plan, threadId, payload, senders) {
    try {
        await senders.sendToChannel(threadId, payload);
        return true;
    } catch (error) {
        if (error?.code === UNKNOWN_CHANNEL) {
            await forget(plan, threadId, senders);
            return "gone";
        }
        logger.warn(`[Threads] Could not post in thread ${threadId} (batch ${plan.batchId}): ${error.message}`);
        return false;
    }
}

async function createThread(plan, message, senders, what) {
    const thread = plan.thread;
    const name = threadName(plan);
    let made;
    try {
        made = message && !thread.privateThread
            ? await senders.startThread(message, name)
            : await senders.createThread(thread.channelId, { name, privateThread: thread.privateThread });
    } catch (error) {
        logger.warn(`[Threads] Could not make the ${what}: ${error.message}`);
        return;
    }
    remember(plan.task.taskId, thread.channelId, made.id);
    try {
        // A thread of its own starts with the task in it; one started from the feed's post has it already.
        if (!message || thread.privateThread) {
            await senders.sendToChannel(made.id, silent(await senders.threadIntro(plan)));
        }
        if (thread.privateThread && thread.members?.length > 0) {
            await senders.addThreadMembers(made.id, thread.members);
        }
    } catch (error) {
        logger.warn(`[Threads] Could not set up the ${what}: ${error.message}`);
    }
    await senders.reportThread({
        serverId: plan.serverId, taskId: plan.task.taskId, channelId: thread.channelId, threadId: made.id,
        privateThread: thread.privateThread,
    }).catch((error) => logger.warn(`[Threads] Could not report the ${what}: ${error.message}`));
}

/** Renames, adds people and archives as the task changes. Never fails the delivery. */
async function keepUp(plan, threadId, senders, what) {
    const thread = plan.thread;
    try {
        const assigning = plan.entries?.some((entry) => ASSIGNING.has(entry.action));
        await senders.updateThread(threadId, {
            name: threadName(plan),
            close: thread.close,
            members: thread.privateThread && assigning ? thread.members : [],
        });
    } catch (error) {
        if (error?.code === UNKNOWN_CHANNEL) {
            await forget(plan, threadId, senders);
            return;
        }
        logger.warn(`[Threads] Could not update the ${what}: ${error.message}`);
    }
}

async function forget(plan, threadId, senders) {
    recent.delete(String(plan.task.taskId));
    await senders.reportThread({
        serverId: plan.serverId, taskId: plan.task.taskId, channelId: plan.thread.channelId, threadId, gone: true,
    }).catch((error) => logger.warn(`[Threads] Could not report thread ${threadId} gone: ${error.message}`));
}

function forgetRecentThreads() {
    recent.clear();
}

module.exports = { deliverWithThread, forgetRecentThreads };
