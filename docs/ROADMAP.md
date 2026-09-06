# DEEPER — Production Breakdown

Three gates. Each gate is defined by a **question it answers**, not by a feature count.
If the gate question is answered "no", you do not advance — you fix the gate.

| Gate | Question it answers | Audience | Build target |
|---|---|---|---|
| **First Playable** | *Is the act of digging pleasurable with nothing attached to it?* | Team + 5 friends | Browser build, one link |
| **First Deliverable** | *Does the extraction gamble create real hesitation, and does failure create intent?* | Playtest cohort (20–50), publishers | Itch/TestFlight vertical slice |
| **Shippable** | *Do players come back tomorrow without being asked to?* | Public | Steam + iOS/Android |

---

## Gate 1 — FIRST PLAYABLE  *(this repo, today)*

> **Pass condition (GDD §25):** breaking ordinary material is still pleasurable after ten minutes,
> and a correct prediction feels measurably better than an accidental find.

Everything here exists to serve GDD Pillar 1: *"Digging must feel good with no progression attached."*
Progression is present only as the thinnest possible frame around the verb.

### In scope
- **Strike system** — tap / hold-heavy / **rhythm-timed critical**. Anticipation → impact → hitstop → recoil → debris.
  The perfect-strike window is the skill floor *and* the flow-state engine.
- **Fracture states** — every tile has visible 3-stage damage; cracked neighbours **chain-break**.
- **6 materials with distinct tactile identity** — Dirt, Gravel (falls), Stone, Slate (shears along its bed),
  Granite (needs heavy/crit), Crystal (rings, chains through the cluster).
- **3 clue systems, learnable without a tutorial** —
  1. gold flecks → directional vein,
  2. hairline cracks + airflow + **hollow strike echo** → cavern,
  3. damp stone + blue roots → water pocket (and the geode under it).
- **3 treasure types** — nuggets, gems, artifacts (artifacts write a journal entry).
- **Tile-propagated lighting with occlusion.** Darkness is the compositional tool; light spills into a
  chamber the moment you crack it open.
- **Resources** — health, lantern fuel, carry capacity, tool integrity, utility charges.
- **3 strata** and the **EXTRACT / DESCEND** shaft decision, with `AT RISK` value escalating on the HUD.
- **4 enemies** that each force a *mining* decision — Burrower, Crawler, Stoneback, Mimic Vein.
- **Death loses the unbanked haul**; run summary reports what you *learned*; **restart is one key**.
- **Depot** — bank, ~12 capability upgrades (information upgrades, not % inflation), journal.
- **Full procedural audio** — per-material impact voices, ascending combo pitch, discovery stinger.
- Pixel art, procedural rock textures, particles, hitstop, camera punch, popups.
- Keyboard + mouse + touch.

### Explicitly out of scope
Save-slot management, settings menu, remapping, controller, accessibility options, localisation,
tutorial, narrative, art bible compliance, performance budget on low-end mobile, analytics.

### Instrumented questions for the first playtest
1. Time-to-first-voluntary-restart.
2. Can the player state, unprompted, what gold flecks mean? (no tutorial exists)
3. At which depth do they first hesitate at the shaft?
4. Ratio of crit strikes to total strikes over the session — does it *rise*? (mastery is happening)

---

## Gate 2 — FIRST DELIVERABLE  *(vertical slice)*

> **Pass condition:** players hesitate at 180 m, and can explain *why* they died.

Builds the tension and the memory. This is the build you show a publisher.

- **Environmental combat becomes the real combat.** Collapse ceilings, cut supports, release water onto
  magma, drop loose rock, bury threats, sever an enemy's route. Damage numbers stop being the answer.
- **Full enemy set incl. Glowmoth Swarm** — makes light itself a risk and closes the loop on the
  light resource being a genuine trade (information vs. attention).
- **Structural integrity** — supports, over-mining a chamber, cave-in warnings (dust falling from a
  ceiling is the tell). Ties bracing upgrade to a readable world signal.
- **Water + magma as systems**, not tiles: flow, pressure, steam, cooling into obsidian.
- **Fossil anatomy and ruin geometry as full clue grammars** (GDD §7) — a vertebra genuinely predicts
  a skull; a straight edge genuinely predicts a room.
- **Meta-progression that changes readings**, not stats: sonar, ore analyser, scanner, grapple,
  directional drill, breathing gear, heat protection, extraction beacon.
- **Museum / field guide** — artifacts unlock geological relationships, creature behaviours, and
  *hidden environmental rules*, which is the Explorer↔Achiever bridge in GDD §17.
- 3 biomes, 6+ strata, biome-specific palettes and grammars.
- Onboarding by design, not by text. Save/load. Options. Controller. Mobile-first HUD pass.
- Audio: adaptive music with danger/discovery layers; hidden material inferable by ear alone.

**Kill criteria:** if playtesters descend without hesitation while carrying a large haul, the
push-your-luck structure has failed and Gate 2 does not pass — regardless of feature completeness.

---

## Gate 3 — SHIPPABLE

> **Pass condition:** D1 retention comes from curiosity, not from a reward schedule.

- Full biome set, deep strata, boss-scale set pieces, run objectives.
- Complete collection/lore layer, optional challenges, daily seed + leaderboard (Mastery/Competition).
- Balance pass against telemetry; expedition length tuning to the 5–20 min target.
- Accessibility (colour-blind-safe accent policy — the accent colours *are* information), remapping,
  scalable HUD, screen-shake toggle, haptics.
- Localisation, store pages, trailer, press kit.
- **Monetisation: premium purchase + content expansions.** Explicitly forbidden (GDD §23): paid
  retries, energy timers, streak punishment, randomised monetisation, paid rescue, loss-chasing offers,
  artificially withheld extraction.
- Platform certification, cloud save, crash/perf budgets, live-ops-free content cadence.

---

## The one rule that survives all three gates

> **Every reveal creates another question.** (GDD §26)

Any feature that ends a loop instead of opening the next one is cut, at every gate.
