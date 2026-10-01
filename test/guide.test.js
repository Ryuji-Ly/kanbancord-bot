require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { textLength } = require("./fixtures");
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
    const everything = { features: ALL, boards: 3, columns: true, tasks: true, taskDetails: true, updates: true, notifications: true };
    for (const state of [{}, { features: NONE, boards: 0 }, everything]) {
        assertValid(buildGuideOverview(state));
        STEPS.forEach((_, index) => assertValid(buildGuideStep(index, state)));
    }
});

test("every step can be ticked, and the last one once all the others are", () => {
    const fresh = assertValid(buildGuideOverview({ features: NONE, boards: 0 }));
    assert.ok(!fresh.includes("✅"));
    const going = assertValid(buildGuideOverview({ features: { ...NONE, DUE_DATES: true }, boards: 1, tasks: true, updates: true }));
    assert.equal(going.match(/✅/g).length, 5, "how it works and a board (a board exists), features, tasks, updates");
    assert.ok(going.includes("kc1:guide:page:0"), "Start opens the first step");

    const all = { features: { ...NONE, LABELS: true }, boards: 2, columns: true, tasks: true, taskDetails: true,
        updates: true, notifications: true };
    assert.ok(STEPS.every((step) => step.done?.(all)), "nothing is left that cannot be ticked");
    assert.ok(!STEPS.at(-1).done({ ...all, notifications: false }), "the last step waits for the others");
    assert.equal(assertValid(buildGuideOverview(all)).match(/✅/g).length, STEPS.length);
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

test("the guide's ticks come from one answer, found out as the user; what fails is left unticked", async () => {
    const progress = { features: true, boards: 1, columns: false, tasks: true, taskDetails: false, updates: true,
        notifications: false };
    const ctx = (fail) => ({
        guildId: "999",
        user: { id: `guide-${Math.random()}` },
        api: {
            get: async (path) => {
                if (path === fail) {
                    throw Object.assign(new Error("Unavailable"), { status: 503 });
                }
                return path === "/features" ? { ...NONE, COMMENTS: true } : progress;
            },
        },
    });
    assert.deepEqual(await guideState(ctx(null)), { features: { ...NONE, COMMENTS: true }, boards: 1, columns: false,
        tasks: true, taskDetails: false, updates: true, notifications: false });
    assert.deepEqual(await guideState(ctx("/guide")), { features: { ...NONE, COMMENTS: true } });
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
