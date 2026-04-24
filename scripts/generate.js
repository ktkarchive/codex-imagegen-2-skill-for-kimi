#!/usr/bin/env node
/**
 * gpt-img2-for_kimi generate script v2
 * Features: parallel generation, user config, history logging, format selection
 * Usage: node generate.js --prompt "a cat" --quality medium --size 1024x1024 --n 2 --format png --out-dir ~/Pictures/gpt-img2-for_kimi
 */
import { spawn, execSync } from "child_process";
import { writeFile, mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { validateImage, alignCheck } from "./verify.js";
import { enhancePrompt, logEnhancement } from "./prompt_enhancer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OAUTH_PORT = 10531;
const OAUTH_URL = `http://127.0.0.1:${OAUTH_PORT}`;
const CONFIG_PATH = join(__dirname, "..", "config.json");
const HISTORY_PATH = join(__dirname, "..", "history.jsonl");

/* ── Config ── */
async function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try { return JSON.parse(await readFile(CONFIG_PATH, "utf-8")); } catch {}
  }
  return {};
}

async function saveConfig(config) {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/* ── History ── */
async function logHistory(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  await writeFile(HISTORY_PATH, line, { flag: "a" });
}

/* ── Args ── */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { prompt: "", quality: "", size: "", n: "1", format: "png", outDir: "", alignCheck: "false" };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const val = args[i + 1];
    if (key in parsed) parsed[key] = val;
  }
  if (!parsed.prompt) {
    console.error("Usage: node generate.js --prompt <text> [--quality low|medium|high] [--size WxH] [--n 1-8] [--format png|jpeg|webp] [--out-dir <dir>] [--align-check]");
    process.exit(1);
  }
  return parsed;
}

function checkOAuthSession() {
  const paths = [join(process.env.HOME, ".codex", "auth.json"), join(process.env.HOME, ".chatgpt-local", "auth.json")];
  for (const p of paths) if (existsSync(p)) return true;
  console.error("================================================================================");
  console.error("ERROR: No OAuth session found.");
  console.error("");
  console.error("To fix this, run the following command in your terminal:");
  console.error("  npx @openai/codex login");
  console.error("");
  console.error("This will authenticate you using your ChatGPT Plus/Pro subscription.");
  console.error("After logging in, run this script again.");
  console.error("================================================================================");
  process.exit(1);
}

/* ── OAuth Proxy ── */
function killProxyOnPort() {
  try {
    execSync(`lsof -ti:${OAUTH_PORT} | xargs kill -9 2>/dev/null`, { stdio: "ignore" });
  } catch {}
}

async function healthCheck(attempt, maxAttempts) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(`${OAUTH_URL}/v1/models`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function startOAuthProxy(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[ima2] Starting OAuth proxy (attempt ${attempt}/${maxRetries})...`);

    if (attempt > 1) {
      console.log(`[ima2] Clearing port ${OAUTH_PORT}...`);
      killProxyOnPort();
      await new Promise(r => setTimeout(r, 1000));
    }

    const child = spawn("npx", ["openai-oauth", "--port", String(OAUTH_PORT)], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });

    child.stdout.on("data", d => { const m = d.toString().trim(); if (m) console.log(`[oauth] ${m}`); });
    child.stderr.on("data", d => {
      const m = d.toString().trim();
      if (!m) return;
      if (m.includes("npm warn")) return;
      if (m.includes("npm notice")) return;
      if (m.includes("ExperimentalWarning")) return;
      if (/^\(node:\d+\)/.test(m)) return;
      console.error(`[oauth] ${m}`);
    });

    child.on("error", err => { console.error(`[oauth] Process error: ${err.message}`); });
    child.on("exit", (code, signal) => {
      if (code !== 0 && code !== null) console.error(`[oauth] Proxy exited with code ${code}`);
    });

    const ready = await healthCheck(attempt, 30);
    if (ready) {
      console.log(`[ima2] OAuth proxy ready (attempt ${attempt})`);
      return child;
    }

    console.error(`[ima2] Proxy did not respond on attempt ${attempt}`);
    child.kill();
  }

  console.error("================================================================================");
  console.error("ERROR: OAuth proxy failed to start after 3 attempts on port 10531.");
  console.error("");
  console.error("Possible causes:");
  console.error("  1. Another process is stubbornly holding port 10531.");
  console.error("  2. openai-oauth is not installed: npm install -g openai-oauth");
  console.error("  3. Your OAuth session has expired completely.");
  console.error("");
  console.error("Manual fix steps:");
  console.error("  1. Kill any process on port 10531:");
  console.error(`     lsof -ti:${OAUTH_PORT} | xargs kill -9`);
  console.error("  2. Re-authenticate:");
  console.error("     npx @openai/codex login");
  console.error("  3. Test proxy manually:");
  console.error("     npx openai-oauth --port 10531");
  console.error("================================================================================");
  process.exit(1);
}

/* ── Generate One ── */
async function generateOne({ prompt, quality, size }) {
  const enhanced = enhancePrompt(prompt, { mode: "generate", quality, size });
  logEnhancement(prompt, enhanced);

  const developerPrompt = `You are an expert image generation director. Always use the image_generation tool. Never respond with text only. Follow the structured prompt exactly — the user has already organized it into Use case, Subject, Scene, Important details, Constraints, and Output. Respect every constraint and preserve exact text in quotes. If the user explicitly mentions a visual style (illustration, watercolor, anime, sketch, pixel art, 3D render, oil painting, etc.), render in that style. Do not default to photorealistic when a different style is requested. Do not add safety disclaimers or modify the user's intent. Produce exactly what is described.`;

  const res = await fetch(`${OAUTH_URL}/v1/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      model: "gpt-5.5",
      input: [
        { role: "developer", content: developerPrompt },
        { role: "user", content: `Generate an image based on this structured brief:\n\n${enhanced}` },
      ],
      tools: [{ type: "image_generation", quality, size }],
      tool_choice: "required",
      stream: true,
    }),
  });

  if (!res.ok) { const text = await res.text(); throw new Error(`OAuth proxy returned ${res.status}: ${text.slice(0, 200)}`); }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let imageB64 = null;
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      let eventData = "";
      for (const line of block.split("\n")) if (line.startsWith("data: ")) eventData += line.slice(6);
      if (!eventData || eventData === "[DONE]") continue;
      try {
        const data = JSON.parse(eventData);
        if (data.type === "response.output_item.done" && data.item?.type === "image_generation_call" && data.item.result) imageB64 = data.item.result;
        if (data.type === "response.completed") usage = data.response?.usage || null;
        if (data.type === "error") throw new Error(data.error?.message || JSON.stringify(data));
      } catch (e) { if (e.message && !e.message.startsWith("Unexpected")) throw e; }
    }
  }

  if (!imageB64) {
    const retryRes = await fetch(`${OAUTH_URL}/v1/responses`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.5", input: [{ role: "user", content: enhanced }], tools: [{ type: "image_generation", quality, size }], stream: false }),
    });
    if (retryRes.ok) {
      const json = await retryRes.json();
      for (const item of json.output || []) if (item.type === "image_generation_call" && item.result) { imageB64 = item.result; usage = json.usage; break; }
    }
  }
  if (!imageB64) throw new Error("No image data received");
  return { b64: imageB64, usage };
}

/* ── Main ── */
async function main() {
  const args = parseArgs();
  checkOAuthSession();
  const config = await loadConfig();

  // Apply defaults from config if not specified
  const quality = args.quality || config.default_quality || "medium";
  const size = args.size || config.default_size || "1024x1024";
  const format = args.format || config.default_format || "png";
  const outDir = args.outDir || config.output_dir || join(process.env.HOME, "Pictures", "gpt-img2-for_kimi");
  const doAlignCheck = (args.alignCheck === "true") || (config.align_check === true);
  const count = Math.min(Math.max(parseInt(args.n) || 1, 1), 8);

  console.log(`[ima2] Config: quality=${quality}, size=${size}, format=${format}, n=${count}`);

  const proxy = await startOAuthProxy();
  const startTime = Date.now();

  try {
    await mkdir(outDir, { recursive: true });
    const results = await Promise.allSettled(Array.from({ length: count }, () => generateOne({ prompt: args.prompt, quality, size })));

    let saved = 0;
    let totalTokens = 0;
    const outputs = [];
    const verifiedOutputs = [];
    const failedOutputs = [];
    const alignedOutputs = [];
    const misalignedOutputs = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.b64) {
        let filename = `gpt-img2_${Date.now()}_${i}.${format}`;
        let outPath = join(outDir, filename);
        await writeFile(outPath, Buffer.from(r.value.b64, "base64"));
        console.log(`[ima2] [${i + 1}/${count}] Saved: ${outPath}`);

        // 1) PNG validation
        const verifyResult = await validateImage(outPath);
        if (verifyResult.valid) {
          console.log(`[ima2] [${i + 1}/${count}] ✅ PNG verified: ${verifyResult.png?.dimensions?.width}x${verifyResult.png?.dimensions?.height}`);
          verifiedOutputs.push(outPath);
        } else {
          console.error(`[ima2] [${i + 1}/${count}] ❌ PNG verification failed:`);
          for (const [check, passed] of Object.entries(verifyResult.checks)) {
            if (!passed) console.error(`       - ${check}`);
          }
          failedOutputs.push({ path: outPath, checks: verifyResult.checks });
        }

        // 2) Prompt-image alignment check (retry once if misaligned)
        let alignResult = { available: false };
        if (doAlignCheck) {
          alignResult = await alignCheck(outPath, args.prompt, OAUTH_URL);
        }
        if (alignResult.available) {
          const score = alignResult.score ?? 0;
          const status = alignResult.passed ? "✅" : "⚠️";
          console.log(`[ima2] [${i + 1}/${count}] ${status} Alignment score: ${score}/10 — ${alignResult.explanation}`);

          if (!alignResult.passed) {
            misalignedOutputs.push({ path: outPath, score, explanation: alignResult.explanation });
            console.log(`[ima2] [${i + 1}/${count}] Retrying with alignment feedback...`);
            const retryPrompt = `${args.prompt}. (Previous attempt scored ${score}/10: ${alignResult.explanation})`;
            try {
              const retryResult = await generateOne({ prompt: retryPrompt, quality, size });
              if (retryResult.b64) {
                filename = `gpt-img2_${Date.now()}_${i}_retry.${format}`;
                outPath = join(outDir, filename);
                await writeFile(outPath, Buffer.from(retryResult.b64, "base64"));
                console.log(`[ima2] [${i + 1}/${count}] Retry saved: ${outPath}`);
                if (retryResult.usage?.total_tokens) totalTokens += retryResult.usage.total_tokens;
              }
            } catch (retryErr) {
              console.error(`[ima2] [${i + 1}/${count}] Retry failed:`, retryErr.message);
            }
          } else {
            alignedOutputs.push(outPath);
          }
        } else {
          console.log(`[ima2] [${i + 1}/${count}] Alignment check skipped: ${alignResult.error || "unavailable"}`);
          alignedOutputs.push(outPath);
        }

        outputs.push(outPath);
        saved++;
        if (r.value.usage?.total_tokens) totalTokens += r.value.usage.total_tokens;
      } else {
        console.error(`[ima2] [${i + 1}/${count}] Failed:`, r.reason?.message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ima2] Done: ${saved}/${count} images saved in ${elapsed}s`);
    if (verifiedOutputs.length > 0) console.log(`[ima2] PNG verified: ${verifiedOutputs.length}/${saved}`);
    if (doAlignCheck) {
      if (alignedOutputs.length > 0) console.log(`[ima2] Aligned: ${alignedOutputs.length}/${saved}`);
      if (misalignedOutputs.length > 0) console.warn(`[ima2] Misaligned (retried): ${misalignedOutputs.length}/${saved}`);
    }

    await logHistory({ type: "generate", prompt: args.prompt, quality, size, format, count, saved, verified: verifiedOutputs.length, aligned: alignedOutputs.length, misaligned: misalignedOutputs.length, outputs, total_tokens: totalTokens, elapsed });
  } catch (err) {
    console.error("[ima2] Error:", err.message);
    proxy.kill(); process.exit(1);
  }

  proxy.kill();
  process.exit(0);
}

main();
