# CodeBrown — a small living planet

A browser simulation of guided emergence. Cubes are **beings**, not machines:
they have internal state, an evolving personality, limited perception, memory
of who helped or betrayed them, and emotion-driven drives. Tribes form and
break, scouts explore, ambushes happen near resources, shelters get built, and
across generations behaviour evolves like **culture** — not script.

▶ **Play:** https://maxlirio.github.io/CodeBrown/

## What's modelled

| System | File |
|---|---|
| Persistent world: terrain, typed resources (food/wood/stone), storms, cliffs, **fire**, **day/night**, **seasons**, decaying structures, scars | `src/world.js` |
| Beings: energy **and health** pools, traits, relationships, learned bias, **spatial memory**, **memory decay**, **lineage/kin**, life cycle & aging | `src/cube.js` |
| Limited awareness — vision shrinks at night; senses kin, predators, resource types | `src/perception.js` |
| Emotion-driven utility AI: gather / flee / group / explore / attack / build / rest / **share**, memory-guided navigation | `src/behavior.js` |
| **Predators** — a non-cube threat species that hunts lone cubes | `src/predator.js` |
| Social layer: signals, groups, **leadership**, **territory & trespass**, **gossip/reputation**, combat, **sharing**, **disease/contagion**, **in-generation reproduction**, **speciation**, reinforcement, social learning | `src/sim.js` |
| Generational culture: fitness-weighted snapshot → inherited, mutated descendants | `src/generation.js` |
| Instanced Three.js view (day/night lighting, rainclouds, fire) + minimap + HUD | `src/render.js`, `src/ui.js` |

## Emergent dynamics you'll see

- **Population boom & bust** — reproduction needs an energy surplus, so tribes
  grow in good seasons and crash in winter / under predator pressure.
- **Tribes & territory** — groups form around trust and kinship, appoint
  leaders, and grow soft territory rings that trespassers are attacked in.
- **Speciation** — lineages whose traits drift far enough apart stop
  cooperating and interbreeding, splitting into distinct peoples.
- **Settlements** — cubes harvest wood/stone, raise shelters (stone lasts
  longer), and maintain them against decay and fire.

## How it works

- **No global knowledge.** Each cube only sees what's within vision and what it
  remembers. Misunderstanding and surprise are emergent, not coded.
- **Drives, not rules.** Every tick a cube feels pressure and scores each action
  emotionally, with noise — so it hesitates, cooperates, or betrays.
- **The world is history.** Structures and scars persist across generations;
  new cubes spawn near remembered safe landmarks.
- **Culture evolves.** Survivors weighted by fitness pass on mutated traits and
  partial behavioural bias. If a generation thrived on high ground, the next is
  born more cautious and drawn upward.

No neural nets, no APIs — just lightweight math. Runs entirely client-side.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Controls: pause, speed (1–8×), follow/free camera, reset world.
