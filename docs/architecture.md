# Architecture and local API

## Overview

RetroVault uses Node.js built-in modules and browser-native JavaScript. One HTTP server serves the frontend and handles RetroAchievements requests. No bundler, database server, package installation, or frontend framework is required.

```text
Browser (public/)
    |
    | Local HTTP requests
    v
Node.js server (server.mjs)
    |                    |
    | HTTPS + API key    | JSON files
    v                    v
RetroAchievements API   .data/
```

## Source layout

| Path | Responsibility |
| --- | --- |
| `server.mjs` | Environment configuration, HTTP routes, API requests, synchronization, and persistence. |
| `lib/games.mjs` | Game deduplication, played-game filtering, achievement normalization, and status classification. |
| `public/index.html` | Dashboard structure and dialogs. |
| `public/app.js` | Rendering, filters, charts, user interactions, and synchronization polling. |
| `public/styles.css` | Responsive layout, colors, typography, and decorative artwork. |
| `public/favicon.svg` | Application icon. |
| `test/games.test.mjs` | Tests for progress normalization and classification rules. |
| `.env.example` | Safe environment configuration template. |

## Data flow

1. Node loads `.env` through the startup command and restores local JSON files.
2. The browser reads `GET /api/dashboard`.
3. If there is no library snapshot and a key is configured, the browser requests synchronization.
4. The server retrieves `GetUserProfile`, all pages of `GetUserCompletionProgress`, all pages of `GetUserRecentlyPlayedGames`, and `GetUserAwards`.
5. Game records are merged by numeric game ID. Only records with positive unlocked achievement counts remain.
6. The library snapshot is saved before fetching detailed metadata.
7. `GetGame` provides cover art, genre, developer, and release information for missing or expired cache entries.
8. The browser polls the dashboard every 2.5 seconds while synchronization is running.
9. Each dashboard response combines the snapshot, cached metadata, and the selected profile's local overrides.

RetroAchievements requests have a 25-second timeout. Pagination uses 500 entries per completion-progress page and 50 per recently-played page. Additional pages are requested sequentially with a 400 ms delay. Game metadata uses a 500 ms delay and a 30-day cache lifetime.

A synchronization failure leaves previously saved data available. There is no scheduled refresh or automatic retry. The UI requests the next synchronization manually, except when initializing a profile without cached data or switching profiles.

## Local API

These routes are internal to the local application. JSON responses use `Cache-Control: no-store`. POST requests require `Content-Type: application/json`; cross-origin browser mutations are rejected when their `Origin` does not match the server host.

### `GET /api/dashboard`

Returns configuration status, the selected username, synchronization state, and the matching profile's game collection when available. It never returns the API key.

The `sync` object contains `running`, `phase`, `current`, `total`, and `error`. A game contains normalized progress and status fields, plus available metadata and any effective local overrides.

### `POST /api/sync`

Body: `{}`.

Starts background synchronization. Returns HTTP 202 when a sync is running or starts, or HTTP 200 when a snapshot for the selected profile was saved less than one minute ago.

### `POST /api/settings`

```json
{ "username": "your_username" }
```

Saves the selected profile and starts synchronization. Usernames must contain 1–32 letters, digits, underscores, or hyphens. Returns HTTP 409 if synchronization is already running.

### `POST /api/game`

```json
{
  "id": 1,
  "genre": "Platformer, Adventure",
  "beaten": true
}
```

Updates the selected profile's local game override. The game must exist in the current profile snapshot.

- Omit `genre` to leave its override unchanged. An empty or whitespace-only string restores the API genre. Values are limited to 100 characters.
- Set `beaten` to `true` or `false` to override campaign completion, or `null` to restore automatic classification. Omit it to leave the existing override unchanged.
- Achievement totals and mastery status cannot be edited through this route.

## Persistence and limitations

JSON files are stored relative to `server.mjs`, inside `.data/`. The API key is only read from the server process environment. Static serving uses an explicit file allowlist; `.env` and `.data/` are not served.

This is a single-user local application with one synchronization job at a time. Do not run multiple instances against the same `.data/` directory: JSON writes are not coordinated between processes. There is no account login, encrypted local storage, database migration system, or public-hosting configuration.

See the [README](../README.md#how-statistics-work) for the precise meanings of played, beaten, completed, mastered, and genre statistics.
