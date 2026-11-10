# Boom Brothers: Atomic Liberty

A run-and-gun, blow-everything-up side scroller starring **Noah** and **Elijah**.
Run right, smash the grumpy Grumbots, blast through walls, rescue the family, and raise the flag!

## How to play

Open `index.html` in any web browser (double-click it). Nothing to install.

Choose **PLAY!**, then everyone joins on the **"Who is playing?"** screen (up to **4 players**):

| Player device | Join | Move | Jump (hold on a wall to **climb**) | Fire | Bomb |
|---|---|---|---|---|---|
| Keyboard, left side | Q | A / D | W | Q | E |
| Keyboard, right side | K | ← / → | ↑ | K | L |
| Gamepad (any number) | A or X | stick / d-pad | A | X / triggers | B / Y |
| Touch screen | tap | on-screen buttons | | | |

On the join screen, press left/right to pick Noah or Elijah, press bomb to leave, and press ENTER or START to go.
The keyboard fits two players, so players 3 and 4 need gamepads.
If the same brother is picked twice, each copy gets a different outfit color.
All players share one pool of lives, and more players means more starting lives.

Playing alone? Just press ENTER twice. A solo player can use any keys (arrows or WASD, Z/X, Space)
and press **R** to swap between brothers mid-level. Q fires and E throws a bomb (the old Z/X and F/G keys still work).
Press jump again in the air for a **double jump**.

P / Esc pauses, M mutes.

## Playing online (each player on their own screen)

Online play works the same way as Race Track Mayhem's online races. One screen **hosts**: it runs the real game
and gets a 4-letter **room code**. The others **join** by typing that code (or tapping it, on the home network).
Each screen can bring up to two keyboard players and any number of gamepads, up to 4 players total.
Joined screens send their button presses to the host and draw what the host sends back, so everyone sees the same game.
Players can also drop in mid-level by pressing FIRE on a gamepad or another screen.

Pick **PLAY ONLINE** on the title screen, then **HOST A GAME** or **JOIN A GAME**. "Meet on" chooses where the screens find each other:

- **Home network** (same house, no internet needed): on one computer run
  ```
  node server.js
  ```
  (needs [Node.js](https://nodejs.org), nothing else to install). It prints an address like
  `http://192.168.1.23:8080`. Open that address on every computer or tablet in the house.
  Open games are listed on the join screen, so kids can just tap one.
  If Windows asks whether Node.js may use the network, choose **Allow** (Private networks).
- **Internet** (different houses): no setup for players. The game uses Boom Brothers' own relay server on
  Cloudflare (`server/relay`, put online with the **Relay server** GitHub workflow; see
  [its README](server/relay/README.md)). Until that's deployed, it automatically uses Race Track Mayhem's
  relay instead (same rules). This works from any copy of the game, even `index.html` opened straight
  from a folder. To use a different relay, add `?relay=wss://your-relay` to the page address.

Press ESC to leave an online game. If the host leaves, everyone else returns to the online menu.

## The heroes

Every hero's **fire** (Q) and **special** (E) power up each level: level 1 starts simple, and by level 4 each move
has turned into something new. The level card shows everyone's new moves, and the HUD shows each hero's level.

| Level | **Noah** (exploding things, plushies) | **Elijah** (uranium, atomics) | **Andrew** (running, BJJ, sysadmin, guitar, drums) |
|---|---|---|---|
| 1 | Pop rocket / Teddy bomb | Uranium ray / Mini nuke | Power chord (a sound wave) / **BJJ takedown**: a running dash that grabs and slams a robot |
| 2 | Twin rockets / Teddy triplets (splits into 3) | Piercing ray / Atomic blast | Big riff / **Drum solo**: shockwave rings |
| 3 | Homing rockets / Rolling mega teddy | Double ray / Chain reaction | Triple chord / **sudo kill -9 bots**: zaps every robot on screen |
| 4 | Homing firework rockets / Teddy airstrike | Gamma beam (3-way) / Atomic sun | Shred solo (a stream of notes) / **Rock concert**: amps drop from the sky, drums and zaps |

Andrew runs a little faster than the brothers, and his sound waves go around robot shields.
Pick a hero with left/right on the join screen; playing alone, press **R** to switch hero mid-level.

## Things in the world

- **Uranium barrels** (green) and **firework crates** (red/white/blue) explode in chain reactions.
- **Cages**: free a family member for +1 life. They follow you to the flag.
- **Crosses**: checkpoints. "Jesus loves you!" restores health and revives fallen teammates.
- **Peace Dove**: a shield that makes you invincible for a while.
- **Uranium crystals / teddy bears**: +1 bomb. **Hearts**: full health.
- Falling in a pit only costs one heart, and you pop back to safe ground.

## Levels

1. Grumbot Valley (eagle ending)
2. Uranium Mines (teddy rocket ending)
3. Plushie Factory (family dance party)
4. Liberty Fortress: boss fight with **MEGA GRUMP 9000**

## Files

| File | What it is |
|---|---|
| `index.html` | The page. Open it to play. |
| `game.js` | The whole game: levels, heroes, robots, drawing, sound, and online play. |
| `server.js` | Optional home-network server: serves the game and passes messages between screens. |
| `server/relay/` | The internet game server for Cloudflare. Its `relay-core.mjs` rules are shared with `server.js`. |
| `.github/workflows/relay.yml` | One-click deploy of the internet game server (Actions > Relay server). |
| `launcher/` | `BoomBrothers.exe`, a tiny Windows program that opens the game in its own window (for SauceStore). |
| `saucestore.json`, `store/`, `release-notes/` | The SauceStore listing, its icon, and each version's notes. |
| `.github/workflows/release.yml` | Builds `BoomBrothers-windows.zip` and publishes a release when you push a version tag. |

## Publishing to SauceStore

`saucestore.json` is the store listing, and `.github/workflows/release.yml` builds
`BoomBrothers-windows.zip` and publishes a GitHub release when you push a version tag
(`git tag v1.0.0 && git push origin v1.0.0`, or Actions > Release > Run workflow).
SauceStore finds the release on its own within about 10 minutes.

- The zip holds `BoomBrothers.exe` (from `launcher/`), the game and the home-network server. SauceStore starts
  apps by running their `.exe`, and this one opens `index.html` in a Microsoft Edge app window (no tabs or address
  bar), or the default browser if Edge is missing.
- Before tagging, write what changed in `release-notes/<version>.md`, one change per line. SauceStore shows these
  lines as the game's Version history (a line starting with "Added" is tagged New, "Fixed" is tagged Fixed).
- The store reads `saucestore.json` from the release's tag, so listing edits go live with the next release.
- `rightsConfirmed` must be `true` for the store to show the game. It's your statement that you checked the
  content against SauceStore's content policy.
- `store/icon.png` is drawn from the game's own sprites: `node tools/make-icon.js` redraws it (needs Playwright).

## Customize

At the top of `game.js`, change `FAMILY` to the real names of your family. Those names
pop up when each cage is opened. Levels are built from text "chunks" in `CHUNKS`
(see the legend above them), so new levels are easy to sketch out.
