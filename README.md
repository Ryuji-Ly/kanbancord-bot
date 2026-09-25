# KanbanCord bot

A kanban board that lives in your Discord server. Create boards and tasks, move and assign them, set labels, priorities
and due dates, and discuss them in comments, all with slash commands. Updates arrive in the channels you choose and, for
your own tasks, by direct message.

This is the Discord bot. The website, where you can see whole boards at a glance and fine-tune settings, is at
**[kanbancord.com](https://kanbancord.com)**.

- **Add it to your server:** use "Add to Discord" at the bottom of [kanbancord.com](https://kanbancord.com).
- **Help:** run `/help` in Discord, or read the [FAQ](https://kanbancord.com/faq).
- **Questions, bugs or ideas?** Join the [support server](https://discord.gg/SDr4ujFPGR), or use `/report` in Discord.
- **Support the project:** [kanbancord.com/support](https://kanbancord.com/support).

## Commands

| Command | What it does |
| --- | --- |
| `/board list` · `view` · `create` · `edit` · `archive` · `restore` | Find, create and manage boards. New boards start with To Do, In Progress and Done. |
| `/column add` · `rename` · `move` · `delete` | Shape a board's columns. |
| `/task create` · `view` · `edit` · `move` · `delete` | Add tasks and move them through the board. |
| `/task assign` · `unassign` | Assign people or whole roles. |
| `/task label` · `priority` · `due` | Organise tasks with labels, priorities and due dates. |
| `/comment list` · `add` | Discuss a task. |
| `/notifications` | Choose what the bot tells you by direct message. |
| `/kanbancord settings` · `audit-channel` · `feed` | For server managers: update feeds and the audit log channel. |
| `/report` | Send a bug report or suggestion to the developer. |
| `/help` | Every command, with examples. |

Task and board views come with buttons for the common actions, so most things take a click rather than a command.
Everything follows your server's Discord roles and each board's permissions.

## Development

The bot needs the KanbanCord API to run: boards, tasks, permissions and notifications live there, and the bot talks to
it on behalf of the person using a command.

Requirements: Node.js 22, and a Discord application with the **Server Members** privileged intent enabled.

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

| Variable | |
| --- | --- |
| `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID` | From the Discord developer portal. Required. |
| `DISCORD_GUILD_ID` | Optional: register commands in one test server only, where they update instantly. |
| `KANBANCORD_API_BASE_URL` | Where the API runs. Defaults to `http://localhost:8080`. |
| `KANBANCORD_INTERNAL_SYNC_TOKEN` | The shared secret the API expects from the bot. |
| `KANBANCORD_WEB_URL` | The website, for "Open on website" links. Defaults to `https://kanbancord.com`. |
| `KANBANCORD_DEV_USER_IDS` | Optional: Discord user IDs that receive `/report` submissions. |

```bash
npm run lint
npm test
```

Pushes to `main` build a multi-platform Docker image and publish it to the GitHub Container Registry.

## License

[MIT](LICENSE) © Ryuji Ly. KanbanCord is not affiliated with or endorsed by Discord.
