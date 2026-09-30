require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { snapshotFixture, textLength } = require("./fixtures");
const { STEPS, buildGuideOverview, buildGuideStep } = require("../src/ui/guideViews");
const { buildFeaturesPanel, featureChanges } = require("../src/ui/featureViews");
const { guideState } = require("../src/services/guide/guideState");
const { componentCount } = require("../src/ui/containers");
const { decode } = require("../src/utils/customId");

const ALL = { ASSIGNEES: true, DUE_DATES: true, PRIORITIES: true, LABELS: true, COMMENTS: true, PERMISSIONS: true };
const NONE = Object.fromEntries(Object.keys(ALL).map((key) => [key, false]));

function assertValid(container) {
    const json = container.toJSON();
    assert.ok(textLength(json) < 4000, `text is ${textLength(json)} characters`);
    assert.ok(componentCount([json]) <= 40);
    const text = JSON.stringify(json);
    for (const id of text.match(/kc1:[^"]+/g) ?? []) {
        assert.ok(decode(id).current && id.length <= 100, id);
    }
    for (const description of text.match(/"description":"[^"]*"/g) ?? []) {
        assert.ok(description.length - 16 <= 100, description);
    }
    return text;
}

test("every guide page is valid for Discord, whatever the server has", () => {
    for (const state of [{}, { features: NONE, boards: 0, tasks: 0, feeds: 0 }, { features: ALL, boards: 3, tasks: 9, feeds: 1 }]) {
        assertValid(buildGuideOverview(state));
        STEPS.forEach((_, index) => assertValid(buildGuideStep(index, state)));
    }
});

test("the overview ticks off what the server has done, and nothing it could not find out", () => {
    const fresh = assertValid(buildGuideOverview({ features: NONE, boards: 0, tasks: 0 }));
    assert.ok(!fresh.includes("✅"));
    const going = assertValid(buildGuideOverview({ features: { ...NONE, DUE_DATES: true }, boards: 1, tasks: 4, feeds: 2 }));
    assert.equal(going.match(/✅/g).length, 4, "features, a board, tasks and a feed");
    assert.ok(going.includes("kc1:guide:page:0"), "Start opens the first step");
});

test("steps follow the server's features: the task form's fields, and how to turn features on", () => {
    const index = (key) => STEPS.findIndex((step) => step.key === key);
    const simple = { features: NONE };
    assert.match(assertValid(buildGuideStep(index("tasks"), simple)), /form for the title and description\. /);
    assert.match(assertValid(buildGuideStep(index("tasks"), { features: ALL })),
        /title and description, and people, a due date and a priority\./);
    const details = assertValid(buildGuideStep(index("details"), { features: { ...NONE, LABELS: true } }));
    assert.equal(details.match(/switched off here/g).length, 4, "everything but labels");
    assert.match(assertValid(buildGuideStep(index("features"), simple)), /Right now: simple mode/);
    assert.match(assertValid(buildGuideStep(index("updates"), simple)), /board post.*feed/s);

    const last = assertValid(buildGuideStep(STEPS.length - 1, simple));
    assert.ok(last.includes("Support server") && last.includes("\"disabled\":true"), "no Next on the last step");
});

test("the features panel shows simple mode, and its menu sets exactly the chosen features", () => {
    const simple = assertValid(buildFeaturesPanel(NONE));
    assert.match(simple, /\*\*Simple mode\.\*\*/);
    assert.ok(/kc1:feat:simple[^}]*"disabled":true/.test(simple), "already in simple mode");
    const some = assertValid(buildFeaturesPanel({ ...NONE, LABELS: true, DUE_DATES: true }));
    assert.match(some, /2 of 6 features on/);
    assert.match(some, /"value":"LABELS","description":"[^"]*","default":true/, "the menu shows what is on");
    assert.deepEqual(featureChanges(["LABELS"]), { ...NONE, LABELS: true });
});

test("the guide's ticks are found out as the user, and skipped where they may not look", async () => {
    const snapshot = snapshotFixture({ tasks: 2 });
    const ctx = {
        guildId: "999",
        user: { id: `guide-${Math.random()}` },
        api: {
            get: async (path) => {
                if (path === "/notifications") {
                    throw Object.assign(new Error("Forbidden"), { status: 403 });
                }
                if (path === "/features") {
                    return { ...NONE, COMMENTS: true };
                }
                if (path === "/boards") {
                    return { content: [snapshot.board] };
                }
                return snapshot;
            },
        },
    };
    assert.deepEqual(await guideState(ctx), { features: { ...NONE, COMMENTS: true }, boards: 1, tasks: 2 },
        "no feeds count for someone who may not see the server's notifications");
});

test("open permissions: shown on the features panel, asked before turning on, kept out of Everything on", async () => {
    const { everythingOn, openPermissionsWarning } = require("../src/ui/featureViews");
    const off = JSON.stringify(buildFeaturesPanel(NONE, false).toJSON());
    assert.match(off, /Open permissions: off/);
    assert.ok(off.includes("kc1:feat:open") && !off.includes("kc1:feat:close"));
    const on = JSON.stringify(buildFeaturesPanel({ ...ALL, PERMISSIONS: false }, true).toJSON());
    assert.match(on, /Open permissions: on/);
    assert.ok(on.includes("kc1:feat:close"));
    assert.ok(/kc1:feat:all[^}]*"disabled":true/.test(on), "everything that can be on is on");

    assert.ok(!everythingOn(NONE, true).includes("PERMISSIONS"), "never custom permissions while open");
    assert.ok(everythingOn(NONE, false).includes("PERMISSIONS"));

    const blocked = JSON.stringify(openPermissionsWarning(true).toJSON());
    assert.match(blocked, /Custom permissions are on/);
    assert.ok(/kc1:feat:openyes[^}]*"disabled":true/.test(blocked), "cannot turn on over custom permissions");
    assert.ok(!/kc1:feat:openyes[^}]*"disabled":true/.test(JSON.stringify(openPermissionsWarning(false).toJSON())));
});
