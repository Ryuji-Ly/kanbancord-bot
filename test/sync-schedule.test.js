require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { waitForApi, startSyncSchedule } = require("../src/services/sync/syncScheduler");

test("waits for the API with growing pauses, and gives up after the limit", async () => {
    let clock = 0;
    const sleeps = [];
    const sleep = async (ms) => {
        sleeps.push(ms);
        clock += ms;
    };
    let calls = 0;
    const upOnFifth = async () => ++calls >= 5;
    assert.equal(await waitForApi({ check: upOnFifth, sleep, now: () => clock }), true);
    assert.deepEqual(sleeps, [2000, 4000, 8000, 16000]);

    sleeps.length = 0;
    clock = 0;
    assert.equal(await waitForApi({ check: async () => false, sleep, now: () => clock, maxWaitMs: 60_000 }), false);
    assert.ok(clock <= 60_000, `gave up after ${clock}ms`);
});

test("syncs once the API is ready, then schedules the next run", async () => {
    const events = [];
    let release;
    const stop = startSyncSchedule({}, {
        ready: async () => {
            events.push("ready");
            return true;
        },
        sync: async () => {
            events.push("sync");
            return { success: 3, failed: 1 };
        },
        sleep: (ms) => {
            events.push(`sleep ${ms}`);
            return new Promise((resolve) => {
                release = resolve;
            });
        },
    });
    await new Promise((resolve) => setImmediate(resolve));
    stop();
    release();
    assert.deepEqual(events, ["ready", "sync", "sleep 300000"], "a run with failures is retried after 5 minutes");
});
