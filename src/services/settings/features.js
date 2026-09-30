/**
 * The server's features and whether open permissions are on, as the user sees them. Anyone who can
 * view the server may look; changing them is for its managers.
 */
async function loadFeatures(ctx) {
    const [enabled, open] = await Promise.all([ctx.api.get("/features"), ctx.api.get("/features/open-permissions")]);
    return { enabled: enabled ?? {}, open: Boolean(open?.enabled) };
}

module.exports = { loadFeatures };
