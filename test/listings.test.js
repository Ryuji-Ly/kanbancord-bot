require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Collection } = require("discord.js");

const { postStats, totals } = require("../src/services/listings/listingStats");
const { SITES } = require("../src/services/listings/sites");

const STATS = { botId: "1303467182344241283", guilds: 42, users: 5000 };

test("each listing site gets its own request, with its token, and sites without one are skipped", async () => {
    const sent = [];
    const send = async (url, init) => {
        sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
        return { ok: true, status: 200 };
    };
    const sites = SITES.map((site, index) => ({ ...site, token: index === 0 ? "test-token-a" : "test-token-b" }));
    const results = await postStats(STATS, { sites, send });

    assert.deepEqual(results, [{ name: "botboard.gg", ok: true }, { name: "discordbotlist.com", ok: true }]);
    assert.deepEqual(sent, [
        { url: "https://www.botboard.gg/api/v1/bots/1303467182344241283/stats", auth: "test-token-a", body: { server_count: 42 } },
        { url: "https://discordbotlist.com/api/v1/bots/1303467182344241283/stats", auth: "test-token-b", body: { guilds: 42, users: 5000 } },
    ]);

    sent.length = 0;
    await postStats(STATS, { sites: sites.map((site, index) => (index === 0 ? { ...site, token: "" } : site)), send });
    assert.deepEqual(sent.map((request) => request.url), ["https://discordbotlist.com/api/v1/bots/1303467182344241283/stats"]);
});

test("one site failing does not stop the others", async () => {
    const sites = SITES.map((site) => ({ ...site, token: "test-token" }));
    let calls = 0;
    const results = await postStats(STATS, {
        sites,
        send: async () => (++calls === 1 ? { ok: false, status: 401 } : { ok: true, status: 200 }),
    });
    assert.deepEqual(results.map((result) => result.ok), [false, true]);
});

test("totals add up every shard, so each site gets one number", async () => {
    const sharded = {
        shard: {
            fetchClientValues: async () => [10, 32],
            broadcastEval: async () => [1000, 4000],
        },
    };
    assert.deepEqual(await totals(sharded), { guilds: 42, users: 5000 });

    const single = { guilds: { cache: new Collection([["1", { memberCount: 7 }], ["2", { memberCount: 3 }]]) } };
    assert.deepEqual(await totals(single), { guilds: 2, users: 10 });
});

test("the status heartbeat is only sent while every shard is connected", async () => {
    const { beat } = require("../src/services/status/heartbeat");
    const { Status } = require("discord.js");
    const sent = [];
    const send = async (url) => {
        sent.push(url);
        return { ok: true, status: 200 };
    };
    const url = "https://example.test/heartbeat";
    const shards = (...statuses) => ({ shard: { fetchClientValues: async () => statuses } });

    assert.equal(await beat(shards(Status.Ready, Status.Ready), { url, send }), true);
    assert.equal(await beat(shards(Status.Ready, Status.Reconnecting), { url, send }), false, "one shard down: no heartbeat");
    assert.equal(await beat({ ws: { status: Status.Ready } }, { url, send }), true);
    assert.equal(await beat({ ws: { status: Status.Ready } }, { url: "", send }), false, "no address, nothing sent");
    assert.deepEqual(sent, [url, url]);
    await assert.rejects(beat({ ws: { status: Status.Ready } }, { url, send: async () => ({ ok: false, status: 500 }) }), /HTTP 500/);
});
