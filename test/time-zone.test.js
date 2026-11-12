require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { UTC_NOTE, myTimeZone, setMyTimeZone, timeZoneChoices } = require("../src/services/settings/timeZone");
const actions = require("../src/services/boards/taskActions");

const WINTER = new Date("2026-12-01T12:00:00Z");

/** A context whose API answers the time zone requests from `stored`, and counts them. */
function zoneContext(userId, stored, calls = []) {
    return {
        user: { id: userId },
        api: {
            myTimeZone: {
                get: async () => {
                    calls.push("get");
                    if (stored instanceof Error) {
                        throw stored;
                    }
                    return { timeZone: stored, chosen: false };
                },
                update: async ({ timeZone }) => {
                    calls.push(["update", timeZone]);
                    return { timeZone: timeZone === "UTC+8" ? "+08:00" : timeZone, chosen: timeZone !== null };
                },
            },
        },
    };
}

test("the person's time zone is fetched once and kept for a while; unknown or failing reads as UTC", async () => {
    const calls = [];
    const ctx = zoneContext("tz1", "Europe/Berlin", calls);
    assert.equal(await myTimeZone(ctx), "Europe/Berlin");
    assert.equal(await myTimeZone(ctx), "Europe/Berlin");
    assert.equal(calls.length, 1);

    assert.equal(await myTimeZone(zoneContext("tz2", null)), null);
    assert.equal(await myTimeZone(zoneContext("tz3", "Not/AZone")), null);
    assert.equal(await myTimeZone(zoneContext("tz4", new Error("API down"))), null);
});

test("/notifications timezone: saves a choice, explains fixed offsets, and can forget it", async () => {
    const calls = [];
    const ctx = zoneContext("tz5", null, calls);
    const saved = JSON.stringify((await setMyTimeZone(ctx, "UTC+8")).toJSON());
    assert.ok(saved.includes("Time zone saved"));
    assert.ok(saved.includes("UTC+08:00"));
    assert.ok(saved.includes("does not change for summer time"));
    assert.equal(await myTimeZone(ctx), "+08:00", "the new choice is used straight away");
    assert.ok(!calls.includes("get"));

    const place = JSON.stringify((await setMyTimeZone(ctx, "Europe/Berlin")).toJSON());
    assert.ok(place.includes("Europe/Berlin"));
    assert.ok(!place.includes("summer time"));

    const forgotten = JSON.stringify((await setMyTimeZone(ctx, " Forget ")).toJSON());
    assert.deepEqual(calls.at(-1), ["update", null]);
    assert.ok(forgotten.includes("Time zone forgotten"));
    assert.equal(await myTimeZone(ctx), null);
});

test("autocomplete finds places by name, and every place at a typed offset", () => {
    const berlin = timeZoneChoices("berl", WINTER);
    assert.deepEqual(berlin[0], { name: "Europe/Berlin (UTC+01:00 now)", value: "Europe/Berlin" });

    const plusEight = timeZoneChoices("UTC+8", WINTER);
    assert.deepEqual(plusEight[0], { name: "UTC+08:00, all year", value: "+08:00" });
    assert.ok(plusEight.some((choice) => choice.value === "Asia/Singapore"));
    assert.ok(plusEight.length <= 25);

    assert.equal(timeZoneChoices("+5:30", WINTER)[0].value, "+05:30");
    assert.ok(timeZoneChoices("new york", WINTER).some((choice) => choice.value === "America/New_York"));
    assert.equal(timeZoneChoices("", WINTER)[0].value, "none", "forgetting it is offered first");
    assert.ok(timeZoneChoices("", WINTER).length <= 25);
});

test("a due date read as UTC says so, and how to set a time zone", async () => {
    const snapshot = require("./fixtures").snapshotFixture();
    const task = snapshot.tasks[0];
    const ctx = {
        user: { id: "tz6" },
        api: {
            get: async () => snapshot,
            put: async () => ({}),
        },
        client: { boardSnapshots: new Map() },
    };
    const due = new Date("2026-10-01T17:00:00Z");
    const utc = await actions.setDue(ctx, snapshot.board.boardId, task.taskId, due, null);
    assert.ok(utc.notice.includes(UTC_NOTE));
    const known = await actions.setDue(ctx, snapshot.board.boardId, task.taskId, due, "Europe/Berlin");
    assert.ok(!known.notice.includes(UTC_NOTE));
});
