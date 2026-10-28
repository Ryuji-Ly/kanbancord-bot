require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { formatUptime, pingView } = require("../src/commands/ping");
const { textLength } = require("./fixtures");

test("uptime reads in days, hours, minutes and seconds", () => {
    assert.equal(formatUptime(0), "0d 0h 0m 0s");
    assert.equal(formatUptime(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000), "2d 3h 4m 5s");
});

test("each latency is marked good, so-so or bad, and a missing one says why", () => {
    const text = JSON.stringify(pingView({ gateway: 45, discord: 350, api: null, uptime: 61_000 }).toJSON());
    assert.ok(text.includes("**Discord gateway** ✅ `45ms`"), "without the application emojis, the fallbacks show");
    assert.ok(text.includes("**Discord API** ⚠️ `350ms`"));
    assert.ok(text.includes("**KanbanCord API** ❌ `unreachable`"));
    assert.ok(text.includes("`0d 0h 1m 1s`"));

    const starting = JSON.stringify(pingView({ gateway: -1, discord: 900, api: 12, uptime: 0 }).toJSON());
    assert.ok(starting.includes("**Discord gateway** ❌ `measuring`"), "no heartbeat yet right after connecting");
    assert.ok(starting.includes("**Discord API** ❌ `900ms`"));
    assert.ok(starting.includes("**KanbanCord API** ✅ `12ms`"));
    assert.ok(textLength(pingView({ gateway: 1, discord: 1, api: 1, uptime: 1 })) < 4000);
});
