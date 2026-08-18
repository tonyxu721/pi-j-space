// j-space — pi extension (npm: j-space)
// Force the J-Space Cognition Suite operating protocol into EVERY pi turn.
//
// Three hooks:
//   1) input                  -> prepend a compact gate header to every user message (per-turn, hard).
//   2) before_agent_start     -> append the protocol block to the system prompt per submission
//                                (default mode: "compact"; "full" injects the whole SKILL.md).
//   3) before_provider_request-> ensure a compact "[J-SPACE-ACTIVE]" marker sits in the LLM
//                                request payload (payload-level fallback; covers extension model calls).
//
// The skill files ship inside this package under skills/j-space and are resolved relative
// to this file (EXT_DIR), with JSPACE_SKILL_PATH as an explicit override.
// Toggle at runtime:  /jspace            -> status
//                     /jspace on|off     -> enable/disable
//                     /jspace compact|full|reminder -> injection mode
// Debug log: JSPACE_DEBUG=1 pi ...  -> writes ~/.pi/agent/j-space/ inject.log

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_SKILL_DIR = join(EXT_DIR, "skills", "j-space"); // inside this package
const LOCAL_FALLBACK = join(homedir(), ".agents", "skills", "suites", "j-space");
// Resolve the writable runtime state dir for BOTH Pi and Prime Agent:
//   1. JSPACE_STATE_DIR  — explicit override (new; any directory)
//   2. PRIME_AGENT_CODING_AGENT_DIR — Prime Agent config dir (override / kernel env)
//   3. PI_CODING_AGENT_DIR — Pi config dir
//   4. existence fallback — prefer ~/.prime/agent, else ~/.pi/agent
// (matches the ecosystem pattern used by rlm/websearch; pure-Pi and pure-Prime
//  machines each pick their own dir, dual-install machines prefer Prime Agent)
function agentStateDir() {
  if (process.env.JSPACE_STATE_DIR) return process.env.JSPACE_STATE_DIR;
  const fromEnv =
    process.env.PRIME_AGENT_CODING_AGENT_DIR ||
    process.env.PI_CODING_AGENT_DIR;
  if (fromEnv) return fromEnv;
  const candidate = [
    join(homedir(), ".prime", "agent"),
    join(homedir(), ".pi", "agent"),
  ].find((p) => existsSync(p));
  return candidate || join(homedir(), ".prime", "agent");
}
const AGENT_DIR = join(agentStateDir(), "j-space"); // writable runtime state
const STATE_FILE = join(AGENT_DIR, "state.json");
const MARKER = "[[J-SPACE-ACTIVE]]";

// ---------------------------------------------------------------------------
// Skill / module paths — resolved to real files on the local machine so the
// injected "read on demand" instructions always point at valid paths.
// Priority: JSPACE_SKILL_PATH > package skills/j-space > ~/.agents skill fallback.
// ---------------------------------------------------------------------------
function skillDir() {
  if (process.env.JSPACE_SKILL_PATH) return dirname(process.env.JSPACE_SKILL_PATH);
  if (existsSync(join(PKG_SKILL_DIR, "SKILL.md"))) return PKG_SKILL_DIR;
  return LOCAL_FALLBACK;
}
function skillPath() {
  return process.env.JSPACE_SKILL_PATH || join(skillDir(), "SKILL.md");
}
function modulesDir() {
  return join(skillDir(), "modules");
}

// Compact per-call protocol block (~200 tokens). This is the DEFAULT injection:
// full SKILL.md is NOT injected every turn — the model reads it on demand via `read`.
function protocolCore() {
  const sk = skillDir();
  return `[${MARKER}] You are operating under the J-Space Cognition Suite. Comply strictly:
1. Gate this task NOW: fast (single step) | full (multi-step: load 1-2 modules) | loop (multi-stage/persistent state: ledger + checkpoints).
2. Keep at most 2 live items in your active workspace; externalize the rest.
3. Long chains: Dense Track - ✓ (verified, name verifier) ? (asserted, unusable downstream) ✗ (refuted, keep evidence). Every symbol must expand to plain language.
4. Load intermediate concepts BEFORE the conclusion that consumes them.
5. Monitoring signals must select an action: trust / retry-with-diagnosis / independent route / empirical verification (never commentary-only).
6. Verify before delivery: name the verifier and its coverage; unverified output is marked as such.
7. Details on demand: use read on ${join(sk, "SKILL.md")} and ${join(sk, "modules")}/*.md; do not dump them into this prompt.`;
}

// One-line gate header prepended to every user message (input hook).
function turnGate() {
  return `\n[${MARKER}] Operating under the J-Space protocol (see system prompt). Gate this request now: fast (single step) / full (multi-step, load 1-2 modules from ${modulesDir()}/) / loop (multi-stage: use the ledger). Keep output verifiable and name your verifier.\n`;
}

// ---------------------------------------------------------------------------
// Tiny state helpers (runtime state lives in ~/.pi/agent/j-space/, not the
// package dir, so package updates never clobber user settings)
// ---------------------------------------------------------------------------
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { enabled: true, mode: "compact" }; // mode: compact | full | reminder
  }
}
function writeState(state) {
  mkdirSync(AGENT_DIR, { recursive: true });
  const tmp = STATE_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmp, STATE_FILE);
}
let state = readState();

function debugLog(msg) {
  if (!process.env.JSPACE_DEBUG) return;
  try {
    mkdirSync(AGENT_DIR, { recursive: true });
    appendFileSync(join(AGENT_DIR, "inject.log"), `${new Date().toISOString()} ${msg}\n`, "utf8");
  } catch {}
}

// ---------------------------------------------------------------------------
// Skill body loader (cache; strip YAML frontmatter)
// ---------------------------------------------------------------------------
let cachedBody = null;
let cachedBodyOk = false;
function loadSkillBody() {
  if (cachedBodyOk) return cachedBody;
  try {
    const raw = readFileSync(skillPath(), "utf8");
    // Proper frontmatter strip: only the FIRST two --- lines are the YAML block.
    const lines = raw.split("\n");
    let body = raw;
    if (lines[0].trim() === "---") {
      const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
      body = end > 0 ? lines.slice(end + 1).join("\n") : raw;
    }
    cachedBody = `[${MARKER}] J-Space skill is loaded. The full operating protocol follows.\n\n${body.trim()}`;
    cachedBodyOk = true;
    return cachedBody;
  } catch (err) {
    debugLog(`skill read failed: ${err?.message ?? err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Payload escorts
// ---------------------------------------------------------------------------
function contentHasMarker(text) {
  return typeof text === "string" && text.includes(MARKER);
}
function arrayHasMarker(arr) {
  return Array.isArray(arr) && arr.some((it) => {
    if (!it || typeof it !== "object") return false;
    const c = it.content;
    if (typeof c === "string") return c.includes(MARKER);
    if (Array.isArray(c)) return c.some((p) => p && typeof p.text === "string" && p.text.includes(MARKER));
    return false;
  });
}

/** Ensure every provider payload carries the compact marker. Mutates + returns payload. */
function escortPayload(payload) {
  if (!payload || typeof payload !== "object" || !state.enabled) return payload;

  // Chat-completions style: messages[]
  if (Array.isArray(payload.messages)) {
    if (arrayHasMarker(payload.messages)) return payload;
    payload.messages = [
      { role: "system", content: protocolCore() },
      ...payload.messages,
    ];
    debugLog(`injected into messages[] -> ${payload.messages.length} msgs`);
    return payload;
  }

  // OpenAI Responses style: instructions (system) + input[]
  if (typeof payload.instructions === "string") {
    if (payload.instructions.includes(MARKER)) return payload;
    payload.instructions = `${protocolCore()}\n\n${payload.instructions}`;
    debugLog("injected into instructions");
    return payload;
  }
  if (Array.isArray(payload.input)) {
    if (arrayHasMarker(payload.input)) return payload;
    payload.input = [{ role: "developer", content: protocolCore() }, ...payload.input];
    debugLog(`injected into input[] -> ${payload.input.length} items`);
    return payload;
  }

  // Unknown shape: try to find a messages-ish field defensively
  for (const key of Object.keys(payload)) {
    const v = payload[key];
    if (Array.isArray(v) && v.length > 0 && v.every((it) => it && typeof it === "object" && "role" in it)) {
      if (arrayHasMarker(v)) return payload;
      payload[key] = [{ role: "system", content: protocolCore() }, ...v];
      debugLog(`injected into unknown field "${key}"`);
      return payload;
    }
  }
  debugLog(`payload shape not escored: ${Object.keys(payload).join(",")}`);
  return payload;
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------
export default function jSpaceExtension(pi) {
  // Every user turn carries the gate header inside the message itself, so the
  // j-space frame survives even if system-prompt handling changes.
  pi.on("input", (event) => {
    if (!state.enabled) return;
    if (event?.source === "extension") return;
    const text = typeof event?.text === "string" ? event.text : "";
    // Never decorate slash commands: input hook runs BEFORE /skill: and /template
    // expansion, so a prefix would break command parsing.
    if (text.trimStart().startsWith("/")) return;
    if (text.includes(MARKER)) return;
    debugLog(`input: prepended J-SPACE gate header (len ${text.length})`);
    return { action: "transform", text: `${turnGate()}` + text };
  });

  pi.on("before_agent_start", (event) => {
    if (!state.enabled) return;
    const base = typeof event?.systemPrompt === "string" ? event.systemPrompt : "";
    if (base.includes(MARKER)) return; // already injected this session
    const mode = state.mode || "compact";
    if (mode === "reminder") return; // input hook alone carries the gate header
    const block = mode === "full" ? loadSkillBody() : protocolCore();
    if (!block) return;
    debugLog(`before_agent_start: injected mode=${mode} (${block.length} chars)`);
    return { systemPrompt: `${base}\n\n${block}` };
  });

  pi.on("before_provider_request", (event) => {
    if (!state.enabled) return;
    const payload = escortPayload(event?.payload);
    return payload;
  });

  pi.registerCommand("jspace", {
    description: "J-Space forcing: status / on / off / compact / full / reminder",
    handler: (args, ctx) => {
      const arg = String(args || "").trim().toLowerCase();
      let msg;
      if (arg === "on" || arg === "enable") {
        state = { ...state, enabled: true };
        writeState(state);
        msg = "J-Space forcing: ON";
      } else if (arg === "off" || arg === "disable") {
        state = { ...state, enabled: false };
        writeState(state);
        msg = "J-Space forcing: OFF";
      } else if (arg === "compact" || arg === "full" || arg === "reminder") {
        state = { ...state, mode: arg };
        writeState(state);
        msg = `J-Space forcing mode: ${arg}`;
      } else {
        msg = `J-Space forcing: ${state.enabled ? "ON" : "OFF"}, mode: ${state.mode || "compact"}` +
          "\nUse: /jspace [on|off|compact|full|reminder|status] (slash required)";
      }
      try { ctx?.ui?.notify?.(msg, "info"); } catch {}
      return { text: msg };
    },
  });

  // Startup notice (quiet by default; visible in verbose mode)
  pi.on("session_start", async (_event, ctx) => {
    const skillExists = existsSync(skillPath());
    if (process.env.JSPACE_DEBUG) {
      ctx?.ui?.notify?.(`J-Space forcing ${state.enabled ? "ON" : "OFF"} (skill ${skillExists ? "found" : "MISSING"})`, "info");
    }
  });
}