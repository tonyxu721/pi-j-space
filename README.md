# j-space — Pi package

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

The **J-Space Cognition Suite** packaged for [Pi](https://pi.dev) as an official plugin: a skill + a forcing extension that keeps the operating protocol active in **every** conversation turn.

> J-Space is an inference-time cognitive control layer built on the accessible representational space the model is *poised to say*. It manages what stays active, preserves constraints across long tasks, externalizes durable state, detects reasoning failure, and returns verified results in clean language. No weight changes, no fine-tuning, no hidden service.

> The package is published on npm as **`@tony0721/pi-j-space`** (`npm:@tony0721/pi-j-space`, public). The full research suite lives at [J-Space-Cognition-Suite-V3.6](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6) (README, benchmarks, citation, license).

## Install

```bash
pi install npm:@tony0721/pi-j-space
```

Restart Pi after installation. The package registers:

- **Skill** `skills/j-space` — the complete suite: `SKILL.md` + `modules/` (9 modules) + `references/` + `scripts/`.
- **Extension** `index.js` — keeps j-space active every turn.

## How it works

Three independent injection layers (verified against the Pi main loop; default mode is `compact` so context stays lean):

| Layer | Hook | Effect (≈tokens) |
|---|---|---|
| Per-message gate | `input` | Prepends a one-line gate header to every user message, unless it is a slash command (~40 tk) |
| System prompt | `before_agent_start` | Injects the compact protocol block into the system prompt per submission (~200 tk) |
| Payload fallback | `before_provider_request` | Ensures the `[[J-SPACE-ACTIVE]]` marker is present in the final LLM request payload |

Injection modes (`/jspace`):

- `compact` _(default)_ — ~200-token protocol block; the model loads `SKILL.md` / modules on demand via `read`, following j-space's own selective-loading design.
- `full` — injects the entire `SKILL.md` (~3.8k tk); use only when needed.
- `reminder` — no system block; the per-message gate header carries the frame.

## Usage

Commands must start with `/` (Pi command prefix):

```
/jspace                     Status (shown as a TUI notification)
/jspace on|off              Enable / disable forcing
/jspace compact|full|reminder   Switch injection mode
```

Runtime state persists in `~/.pi/agent/j-space/state.json`.

## Configuration

| Env var | Purpose |
|---|---|
| `JSPACE_SKILL_PATH` | Override the skill `SKILL.md` path (default: the copy inside this package) |
| `JSPACE_DEBUG=1` | Write an `inject.log` under `~/.pi/agent/j-space/` |

## Development

```bash
npm pack --dry-run   # inspect the published tarball
node verify.mjs      # self-check: factory loads, skill/module paths resolve, payload escort works
pi -e ./index.js -p "hi"   # smoke-test the extension in print mode
```

## License

Apache-2.0. See [LICENSE](LICENSE) and the [suite repository](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6) for authors, citation, and provenance.