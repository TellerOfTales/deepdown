# DEEPER — First Playable

> *"I wonder what's down there — and I bet I can get just a little farther."*

A 2D mining/extraction action roguelite. You descend, read the rock, dig toward what you think is
there, and then decide — every single time — whether to take the lift up with what you're carrying
or go one stratum deeper with all of it still at risk.

This repository contains the **First Playable** (Gate 1 of [`docs/ROADMAP.md`](docs/ROADMAP.md)):
the build whose only job is to prove that *breaking ordinary rock is pleasurable with nothing
attached to it.*

## Play

```bash
npm install
npm run dev          # http://localhost:8123
```
or build a single self-contained file that runs from disk with no server:
```bash
npm run build        # dist/deeper.html
```

## Controls

| | |
|---|---|
| **A / D** or **← / →** | move (and aim the pick sideways) |
| **W / S** or **↑ / ↓** | aim the pick up / down · climb a chimney |
| **SPACE** / **J** / **click** | **DIG** — tap on the beat, or hold for a heavy strike |
| **K** / **X** / **SHIFT** | jump |
| **L** / **C** / **right-click** | use a charge (blast / sonar) |
| **E** | interact — the shaft, the lift |
| **F** | dim the lantern (lasts longer, attracts less) |
| **R** | dig again, immediately |
| **ESC** | pause · **M** mute |

Touch: drag the left half of the screen to move, big button on the right to dig.

## The one mechanic to understand

The pick has a rhythm. After every strike there is a moment when it becomes ready again — press
**exactly then** and you land a **critical fracture**: double damage, the note jumps a fifth, and
your combo climbs. The combo raises the pitch again, and raises what the ore is worth.

Mashing is *worse* than listening. That is the whole design.

Holding DIG instead charges a **heavy** strike — slower, stronger, no rhythm required. It is how
you get through granite before you can afford a better pick. Two honest ways to play; one of them
sings.

## What the rock is telling you

Nothing in this mine is noise. Every one of these is a real, exploitable rule:

- **Gold flecks** thicken toward the seam. Dig where they crowd, not where they're sparse.
- **A hairline crack** in the face means open space behind it — and a struck wall with a cavity
  behind it *answers low and long*. You can hear a chamber before you see it.
- **Blue roots** reach for water. Water sits above the geodes. Water also floods your tunnel.
- **Slate** lets go along its bed: one clean strike opens a corridor.
- **Straight edges** in stone are not accidents. Someone cut that.
- **Vertebrae curve toward the skull.** Follow the anatomy.
- **If the flecks sit on a perfect grid, it isn't gold. It's teeth.**

You are never told any of this. You work it out, and the game writes it into your field notes the
moment you prove it.

## Layout

```
src/
  config.js          every feel number in the game, and nothing else
  game.js            run lifecycle + the composition of feel (strike -> sensation -> next question)
  render.js          world draw order, lighting composite, glow pass
  main.js            canvas, scaling, loop, touch
  core/    rng  input  audio  save
  world/   tiles  world  gen  light
  entities/player  enemies  items
  fx/      particles  camera
  art/     pal  spritesheet  font  tiletex  sprites_*
  ui/      hud  screens
docs/
  ROADMAP.md         First Playable / First Deliverable / Shippable, with kill criteria
  ARCHITECTURE.md    module contracts
```

No dependencies at runtime. No asset files: every sprite is authored ASCII, every rock texture is
generated at boot, and every sound is synthesised from oscillators and noise.

## Tools

```bash
node tools/check.mjs                 # headless boot + scripted play session + screenshots
node tools/check.mjs --url /tools/preview.html --script raw   # art contact sheet
```
