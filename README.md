# Boom Brothers: Atomic Liberty

A run-and-gun, blow-everything-up side scroller starring **Noah** and **Elijah**.
Run right, smash the grumpy Grumbots, blast through walls, rescue the family, and raise the flag!

## How to play

Open `index.html` in any web browser (double-click it). Nothing to install.

Choose **PLAY!**, then everyone joins on the **"Who is playing?"** screen (up to **4 players**):

| Player device | Join | Move | Jump (hold on a wall to **climb**) | Fire | Bomb |
|---|---|---|---|---|---|
| Keyboard, left side | F | A / D | W | F | G |
| Keyboard, right side | K | ← / → | ↑ | K | L |
| Gamepad (any number) | A or X | stick / d-pad | A | X / triggers | B / Y |
| Touch screen | tap | on-screen buttons | | | |

On the join screen, press left/right to pick Noah or Elijah, press bomb to leave, and press ENTER or START to go.
The keyboard fits two players, so players 3 and 4 need gamepads.
If the same brother is picked twice, each copy gets a different outfit color.
All players share one pool of lives, and more players means more starting lives.

Playing alone? Just press ENTER twice. A solo player can use any keys (arrows or WASD, Z/X, Space)
and press **Q** to swap between brothers mid-level.

P / Esc pauses, M mutes.

## The heroes

- **Noah**: fires pop-rockets that blow up dirt and bricks. His bomb is a **plushie bear** that bounces around and goes *KA-BEAR!*
- **Elijah**: rapid-fire **uranium ray**. His bomb is a glowing uranium core that sets off an **ATOMIC BLAST** with a mushroom cloud.

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

## Customize

At the top of `game.js`, change `FAMILY` to the real names of your family. Those names
pop up when each cage is opened. Levels are built from text "chunks" in `CHUNKS`
(see the legend above them), so new levels are easy to sketch out.
