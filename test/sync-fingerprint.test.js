require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { fingerprintOf } = require("../src/services/sync/syncGuild");
const syncApi = require("../src/api/syncApi");

const server = (overrides = {}) => ({
    name: "Pixel Forge",
    ownerId: "1",
    roles: [{ roleId: "10", name: "Members", position: 1 }, { roleId: "11", name: "Mods", position: 2 }],
    members: [
        { userId: "1", username: "owner", nickname: null, roleIds: ["11", "10"] },
        { userId: "2", username: "mia", nickname: "Mia", roleIds: ["10"] },
    ],
    ...overrides,
});

test("a server's fingerprint ignores order, and changes with anything a sync would send", () => {
    const base = fingerprintOf(server());
    const shuffled = server({
        roles: [...server().roles].reverse(),
        members: [{ ...server().members[1] }, { ...server().members[0], roleIds: ["10", "11"] }],
    });
    assert.equal(fingerprintOf(shuffled), base, "the same server in another order");
    assert.match(base, /^[0-9a-f]{64}$/);

    const renamedRole = server({ roles: [{ ...server().roles[0], name: "Everyone" }, server().roles[1]] });
    const newNickname = server({ members: [server().members[0], { ...server().members[1], nickname: "M" }] });
    const lostRole = server({ members: [server().members[0], { ...server().members[1], roleIds: [] }] });
    const joined = server({ members: [...server().members, { userId: "3", username: "new", roleIds: [] }] });
    for (const changed of [renamedRole, newNickname, lostRole, joined, server({ name: "Renamed" })]) {
        assert.notEqual(fingerprintOf(changed), base);
    }
});

test("a change that could not be sent makes the server's next sync whole", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
        throw new Error("connection refused");
    };
    try {
        await assert.rejects(syncApi.upsertMember({ serverId: "999", userId: "2", data: {} }));
        assert.equal(syncApi.takeMissedChanges("999"), true);
        assert.equal(syncApi.takeMissedChanges("999"), false, "asking clears it");
        assert.equal(await syncApi.serverUnchanged({ serverId: "999", fingerprint: "abc" }), false,
            "when the API does not answer, the server is sent whole");
    } finally {
        globalThis.fetch = realFetch;
    }
});
