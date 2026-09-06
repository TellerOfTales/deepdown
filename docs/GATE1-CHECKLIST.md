# Gate 1 acceptance — how to tell whether First Playable actually passed

The GDD's §25 production validation questions, turned into things you can sit down and check in
ten minutes. A "no" here is a **stop**, not a backlog item: every one of these is load-bearing for
the design, and shipping past a failed row means Gate 2 is being built on sand.

| # | GDD §25 question | How to check it in this build | Passes when |
|---|---|---|---|
| 1 | Is breaking ordinary material pleasurable after ten minutes? | Play stratum I only. Do not descend. Dig for ten minutes. | You are still tapping in rhythm without deciding to. If you find yourself holding DIG out of boredom, the strike loop has failed. |
| 2 | Can players learn geological rules without a tutorial? | Hand the build to someone cold. Say nothing. Watch. | Within one run they dig *toward* thickening gold flecks on purpose, and can say why afterwards. |
| 3 | Does a successful prediction feel better than a random discovery? | Break into a chamber from a `HAIRLINE` tile, then break into one by accident. | The predicted one gets **YOU CALLED IT** — bigger hitstop, a flash, a gold callout. The accident gets a quieter blue one. If they feel the same, the reward hierarchy is broken. |
| 4 | Do players hesitate before descending with value? | Watch the shaft prompt at 45 m carrying ~200, then at 100 m carrying ~2,000. | The second one takes visibly longer to answer. The `AT RISK` number is doing its job. |
| 5 | Can players explain why they died? | Ask, immediately, at the death screen. | The answer is a decision ("I dug into the water", "I opened a chamber under a crawler"), never "it just killed me". |
| 6 | Does failure create a specific next-run intention? | Read **WHAT YOU LEARNED** on the death screen out loud. | There is at least one line there, and the player says a version of "next time I see X, I'll…". |
| 7 | Does every major reveal create another actionable question? | Break the last tile of a gold seam. | A chevron points at where the vein continues. Open a chamber: something in it is lit and unexplained. |
| 8 | Do players restart immediately without external rewards? | Do nothing. Say nothing. Count the seconds on the death screen. | Under three. `R` is the largest, warmest thing on that screen for exactly this reason. |

## Instrumented signals already in the build

`window.G.stats` carries `strikes`, `crits`, `bestCombo`, `tilesBroken`, `deepest`, `runs`, `deaths`.

The single most important number in a playtest is **crits ÷ strikes over time**. If that ratio does
not *rise* across a session, the player is not learning the rhythm, and Pillar 1 has not landed —
no amount of loot tuning will fix it.

Second most important: **depth at which the first hesitation happens**, recorded by hand. If it
never happens, §9's push-your-luck structure is decorative.

## What is machine-verified

These run headlessly against the real build (`node tools/check.mjs --script <name>`), so a
regression in any of them is caught without a human sitting down. None of them can tell you
whether the game is *fun* — that is what the table above is for.

| Script | What it proves |
|---|---|
| `play` | boots, digs, collects, no page errors, 60fps at 1080p |
| `opening` | first 30 s: reaches ~30 m, confirms 2-4 rules, leaves nothing on the ground |
| `clues` | each learnable rule fires in situ — flecks, hollow, shear, granite, mimic |
| `vein` | breaking a `FLECK_RICH` face onto the seam it promised pays out and teaches |
| `descend` | the whole arc: run → shaft → stratum II → shaft → stratum III |
| `screens` | title, depot, journal, shaft decision, death — and death is recorded |

Additionally verified by one-off harnesses during development: water floods a breached tunnel,
unsupported gravel falls and stacks, glowcaps refill the lantern, the bag-full swap keeps
`haul == Σ carried.value` and `weight == Σ carried.w` and never exceeds the cap and never trades
down, climbing a chimney works, granite is answerable by three heavies or two crits, fall damage
scales and does not bounce, the stoneback refuses its armoured face and clamps rather than going
unboundedly negative, the crawler drops when you mine its anchor, the mimic stays buried until it
wakes and pays out when killed, the burrower swims and chews a trackable tunnel, all 47 audio
entry points fire without error, bank/stats/rules/archive/upgrades survive a reload, a corrupt
save degrades to a clean slate, touch controls hit-test correctly at a fractional canvas scale,
and no creature spawns within 14 m of the lift across 60 generated maps.

Generation invariants, measured across 120 maps: hairline false-positive rate 0.6%, one map
without a gem pocket, four without a relic, every vein turn exactly 45°.

## Known First Playable limits (deliberate, tracked to Gate 2)

- Combat is contact-and-pick. Ceiling collapse, cut supports and released water exist as
  *systems* but are not yet the primary answer to an enemy — that is Gate 2's headline.
- Structural integrity / cave-ins are not modelled; loose gravel falls, but chambers cannot
  collapse from over-mining.
- Fossils and ruins are generated with real grammar but their journal payoff is a single relic
  entry rather than the full field-guide relationships of GDD §17.
- One biome. Three strata. Twelve upgrades. No save-slot management, options, or remapping.
- Tool integrity blunts the pick but never breaks it — the failure state is not yet interesting.
