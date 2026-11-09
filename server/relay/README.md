# Boom Brothers game server (relay)

Lets players in different houses play together over the internet. Home routers block other
houses from connecting in, so everyone connects *out* to this relay, which passes the game's
messages along inside a "room". The host gets a 4-letter room code; the others type it to join.

- `relay-core.mjs`: the rules (rooms, codes, passing messages along). Also used by `../../server.js`
  for home-network games, so both always behave the same.
- `worker.mjs` + `wrangler.toml`: the Cloudflare Workers version (free plan).

Same rules and message format as Race Track Mayhem's relay (`uberwulf-hub/Race-Track-Mayhem`, `server/relay`).

## Putting it online (Cloudflare, free)

**With GitHub (easiest):** in this repo's Settings > Secrets and variables > Actions, add
`CLOUDFLARE_API_TOKEN` (from the "Edit Cloudflare Workers" token template) and
`CLOUDFLARE_ACCOUNT_ID`. These are the same values Race Track Mayhem's relay workflow uses.
Then go to Actions > **Relay server** > **Run workflow**.

**From a computer:** `cd server/relay && npm install && npx wrangler login && npx wrangler deploy`

It prints the address, like `https://boom-brothers-relay.<you>.workers.dev`. The game already looks for
`wss://boom-brothers-relay.andrewsaulls.workers.dev` first (`INTERNET_RELAYS` in `game.js`). If yours has a
different address, put it first in that list.

Until this relay is deployed, the game automatically uses Race Track Mayhem's relay instead.
