// Values the config needs to load; tests never talk to Discord or the API.
process.env.DISCORD_BOT_TOKEN ??= "test-token";
process.env.DISCORD_APPLICATION_ID ??= "1";
process.env.KANBANCORD_INTERNAL_SYNC_TOKEN ??= "test-sync-token";
process.env.KANBANCORD_DEV_USER_IDS ??= "123456789012345678";
