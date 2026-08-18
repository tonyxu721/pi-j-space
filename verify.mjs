// verify.mjs — self-check for the j-space Pi package.
// Run: node verify.mjs
// Fails (non-zero exit) if any of: factory loads, skill path resolves, module
// path is real, protocol block interpolates real paths, payload escort works.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("ok:", m);

// Load the extension factory with a mock pi.
const handlers = {};
const cmds = {};
const load = async () => {
  const mod = await import("./index.js");
  const factory = mod.default;
  if (typeof factory !== "function") { fail("factory is not a function"); return false; }
  const pi = {
    on: (n, h) => { (handlers[n] ??= []).push(h); },
    registerCommand: (n, d) => { cmds[n] = d; },
  };
  factory(pi);
  for (const ev of ["input", "before_agent_start", "before_provider_request", "session_start"]) {
    if (!(handlers[ev]?.length)) fail(`missing handler: ${ev}`);
  }
  if (!cmds.jspace) fail("missing /jspace command");
  ok("factory loads; handlers on input/before_agent_start/before_provider_request/session_start; /jspace registered");
  return true;
};
await load();

// Skill + module paths must resolve to real files inside the package.
const skillPath = join(PACKAGE_DIR, "skills", "j-space", "SKILL.md");
const moduleDir = join(PACKAGE_DIR, "skills", "j-space", "modules");
if (!existsSync(skillPath)) fail(`SKILL.md missing: ${skillPath}`);
else ok(`SKILL.md resolves: ${skillPath}`);

// The injected protocol block must reference the on-machine module path.
const beforeAgent = handlers["before_agent_start"][0];
const block = beforeAgent({ systemPrompt: "" }).systemPrompt;
const marker = "[[J-SPACE-ACTIVE]]";
if (!block.includes(marker)) fail("protocol block missing marker");
if (!block.includes(moduleDir)) fail(`protocol block does not interpolate real module dir: ${moduleDir}`);
else ok("protocol block interpolates real module path");

// Payload escort: messages[] and instructions shapes must receive the marker.
// before_provider_request returns the (possibly replaced) payload directly.
const beforeProvider = handlers["before_provider_request"][0];
const p1 = beforeProvider({ payload: { messages: [{ role: "user", content: "hi" }] } });
if (!p1?.messages?.[0]?.content?.includes(marker)) fail("messages[] payload not escored");
else ok("messages[] payload escored");
const p2 = beforeProvider({ payload: { instructions: "sys" } });
if (!p2?.instructions?.includes(marker)) fail("instructions payload not escored");
else ok("instructions payload escored");

// input hook transforms a plain message but skips slash commands.
const onInput = handlers["input"][0];
const r = onInput({ text: "hello" });
if (!(r?.action === "transform" && r.text.includes(marker))) fail("input transform missing marker");
else ok("input gate header applied");
const slash = onInput({ text: "/jspace status" });
if (slash !== undefined) fail("slash command should pass through untouched");
else ok("slash commands pass through");

console.log(process.exitCode ? "VERIFY FAILED" : "ALL CHECKS PASSED");