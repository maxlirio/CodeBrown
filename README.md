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
| Persistent world: terrain, resources, moving storms, cliffs, landmarks, structures, scars | `src/world.js` |
| Beings: state, personality traits, relationships, learned bias | `src/cube.js` |
| Limited line-of-radius awareness | `src/perception.js` |
| Emotion-driven utility AI (survival / safety / social / explore / dominance) | `src/behavior.js` |
| Social layer: signals, groups, combat, reinforcement, social learning | `src/sim.js` |
| Generational culture: snapshot survivors → inherited, mutated descendants | `src/generation.js` |
| Instanced Three.js view + minimap + HUD | `src/render.js`, `src/ui.js` |

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
