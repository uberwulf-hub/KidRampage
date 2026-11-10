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

## Android (phones and tablets)

Each release also has `BoomBrothers-android.apk`. It's the same game in a full-screen landscape app, with big
on-screen touch buttons (they appear as soon as you touch the screen). Get it from SauceStore on the phone, or
open the release page on the phone, download the .apk and open it (allow "install unknown apps" when Android asks).
The back button pauses the game or goes back in the menus. Online play works with a room code.

The app lives in `android/` (a WebView that loads the same `index.html` and `game.js`), and
`.github/workflows/android.yml` builds and signs it. To keep the signing key safe for good, add the
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_ALIAS` and `ANDROID_KEYSTORE_PASSWORD` secrets (the same setup as
Race Track Mayhem); otherwise a key is made on the first release build and kept in the Actions cache.

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

## The story

It's the Fourth of July in Sahuarita, Arizona. Grandpa is grilling, Dad has his guitar, and the boys are ready for the
biggest fireworks show ever, until the grumpy **Grumbots** crash the cookout. **MEGA GRUMP 9000** hates fun: he cages
the family, steals the plushies and takes every firework to power his **Fun-Cancelling Ray**.

1. **Grumbot Valley**: bust the family out of their cages in the desert.
2. **Uranium Mines**: stop the drills digging uranium for the ray (Elijah's specialty).
3. **Plushie Factory**: free the stolen plushies, even the turtle from the science center (Noah to the rescue).
4. **Liberty Fortress**: Dad hacks the gate (`sudo open fortress`), then beat MEGA GRUMP before midnight.

The ending: the ray backfires into the biggest fireworks show ever, Noah hands MEGA GRUMP a teddy bear, and he smiles
for the very first time. He was just lonely, so everyone invites him to the cookout. A short story chapter plays before
each level (`STORY` in `game.js`).

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
| `audio/` | Music and sound effects, `manifest.js` (which file plays when) and `CREDITS.md`. |
| `server.js` | Optional home-network server: serves the game and passes messages between screens. |
| `server/relay/` | The internet game server for Cloudflare. Its `relay-core.mjs` rules are shared with `server.js`. |
| `.github/workflows/relay.yml` | One-click deploy of the internet game server (Actions > Relay server). |
| `launcher/` | `BoomBrothers.exe`, a tiny Windows program that opens the game in its own window (for SauceStore). |
| `saucestore.json`, `store/`, `release-notes/` | The SauceStore listing, its icon, and each version's notes. |
| `.github/workflows/release.yml` | Builds `BoomBrothers-windows.zip` and the Android `.apk` and publishes a release. |
| `android/`, `.github/workflows/android.yml` | The Android app (a full-screen WebView) and its build. |

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

## The look

2.5D: the game plays in 2D, the characters are outlined pixel art, and the world has depth. Blocks show their
3D tops and sides in perspective, and each level has a weird low-poly 3D background drawn by a tiny built-in 3D
renderer (no libraries; see `scene3D` in `game.js`): a ringed planet over floating desert mesas and spinning saguaros,
giant glowing uranium crystals, floating teddy heads and gears, and spinning stars and firework rockets.

## Music and sound effects

The title screen, levels and boss fight have their own music, and explosions, rockets, pickups and more use
recorded sounds. All of it is free **CC0** audio from OpenGameArt and Kenney (see [audio/CREDITS.md](audio/CREDITS.md)).
Everything else (lasers, guitar chords, drums, zaps, the Yankee Doodle fanfare) is synthesized by the game.

To swap or add sounds, drop files into `audio/sfx/` or `audio/music/` and list them in `audio/manifest.js`. You can
give each level its own song (`level1` to `level4`) or use your own music, such as songs made with Suno.
Anything missing falls back to the built-in sounds.

## Customize

At the top of `game.js`, change `FAMILY` to the real names of your family. Those names
pop up when each cage is opened. Levels are built from text "chunks" in `CHUNKS`
(see the legend above them), so new levels are easy to sketch out.
