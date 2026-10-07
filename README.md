# KanbanCord bot

**KanbanCord** is a free kanban board for Discord: a Trello-style task board and shared to-do list that lives in your
Discord server. Teams, clubs, study groups and game-dev communities plan their work where they already talk: create
tasks, move them across columns, assign people and roles, set due dates, labels and priorities, and get updates in
their channels, without leaving Discord.

This repository is the **Discord bot**, and you can run KanbanCord entirely from it: slash commands, buttons and menus
on every board and task, live board posts, update feeds, a thread per task, and direct messages about your own tasks.

| Repository | What it is |
| --- | --- |
| **kanbancord-bot** (this one) | The Discord bot. |
| [kanbancord-frontend](https://github.com/Ryuji-Ly/kanbancord-frontend) | The website at [kanbancord.com](https://kanbancord.com): whole boards with drag and drop, settings, permissions and guides. |
| [kanbancord-api](https://github.com/Ryuji-Ly/kanbancord-api) | The API both of them use: boards, tasks, permissions and notifications. |

- **Add it to your server:** use "Add to Discord" at the bottom of [kanbancord.com](https://kanbancord.com).
- **Help:** run `/help` in Discord, or read the [FAQ](https://kanbancord.com/faq).
- **Questions, bugs or ideas?** Join the [support server](https://discord.gg/SDr4ujFPGR), or use `/report` in Discord.
- **Support the project:** [kanbancord.com/support](https://kanbancord.com/support).

## Commands

| Command | What it does |
| --- | --- |
| `/guide` | A step-by-step guide to setting up and using KanbanCord, all in Discord. |
| `/board list` · `view` · `create` · `edit` · `archive` · `restore` | Find, create and manage boards. New boards start with To Do, In Progress and Done. |
| `/board post` | Post a board in a channel or thread; the post updates itself whenever the board changes. |
| `/board notifications` | Change what the server's update feeds post about one board. |
| `/board threads` | Give each task on a board its own thread in a feed channel, public or private. |
| **Create task** (on a message) | Long-press or right-click any message, then Apps → Create task: the message becomes a task, linking back to it. |
| `/column add` · `rename` · `move` · `delete` | Shape a board's columns. |
| `/task create` · `view` · `edit` · `move` · `delete` | Add tasks and move them through the board. |
| `/task assign` · `unassign` | Assign people or whole roles. |
| `/task label` · `priority` · `due` | Organise tasks with labels, priorities and due dates. |
| `/label` · `/priority` `list` · `create` · `edit` · `delete` | Manage a board's labels and priority levels (`/priority move` reorders them). |
| `/comment list` · `add` | Discuss a task. |
| `/notifications` | Choose what the bot tells you by direct message. |
| `/kanbancord features` | For server managers: simple mode, or which features the server uses. |
| `/kanbancord settings` · `audit-channel` · `feed` | For server managers: update feeds (what they post, who they mention, which boards, buttons on posts) and the audit log channel. |
| `/report` | Send a bug report or suggestion to the developer. |
| `/help` | Every command, with examples. |

Task and board views come with buttons and menus for the common actions, so most things take a click rather than a
command: move, assign, label, set a priority (or make a new label or level right there), comment, follow, or
**Discuss in thread**. Everything follows your server's Discord roles and each board's permissions, and everything but
the permission rules themselves can be set up from Discord. The [guides](https://kanbancord.com/guides) explain each
part in depth.

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
| `KANBANCORD_SUPPORT_URL` | The support server invite linked from `/help`. Defaults to the KanbanCord support server. |
| `KANBANCORD_DEV_USER_IDS` | Optional: Discord user IDs that receive `/report` submissions. |
| `KANBANCORD_STATUS_HEARTBEAT_URL` | Optional: the status page's heartbeat address, called every minute while the bot is connected. |
| `BOTBOARD_TOKEN`, `DISCORDBOTLIST_TOKEN` | Optional: tokens from bot-listing sites, to keep their server count current. |

```bash
npm run lint
npm test
```

Pushes to `main` build a multi-platform Docker image and publish it to the GitHub Container Registry.

## License

[MIT](LICENSE) © Ryuji Ly. KanbanCord is not affiliated with or endorsed by Discord.
