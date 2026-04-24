#!/usr/bin/env node
/**
 * verify.js — Image validation + quality check
 * Validates generated images for corruption, zero-size, wrong format.
 * Optional: vision-based quality assessment via GLM/ZAI API.
 *
 * Usage:
 *   node verify.js --input image.png [--verbose]
 *   node verify.js --input image.png --vision --prompt "a cat"  # quality check
 */
import { readFile, stat } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_PNG_SIZE = 100; // bytes — anything smaller is clearly broken

/* ── PNG Parser ── */
async function parsePNG(filePath) {
  const buffer = await readFile(filePath);
  const result = {
    size: buffer.length,
    signatureValid: false,
    ihdrPresent: false,
    dimensions: null,
    chunks: [],
  };

  // Check signature
  if (buffer.length < 8) return result;
  result.signatureValid = buffer.slice(0, 8).equals(PNG_SIGNATURE);
  if (!result.signatureValid) return result;

  // Parse chunks
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
    result.chunks.push({ type, length, offset });

    if (type === "IHDR") {
      result.ihdrPresent = true;
      if (offset + 16 <= buffer.length) {
        result.dimensions = {
          width: buffer.readUInt32BE(offset + 8),
          height: buffer.readUInt32BE(offset + 12),
        };
      }
    }
    if (type === "IEND") break;

    offset += 12 + length;
  }

  return result;
}

/* ── Validation ── */
export async function validateImage(filePath) {
  const checks = {
    exists: false,
    nonZero: false,
    reasonableSize: false,
    pngSignature: false,
    ihdrPresent: false,
  };

  let pngInfo = null;
  let error = null;

  try {
    const s = await stat(filePath);
    checks.exists = true;
    checks.nonZero = s.size > 0;
    checks.reasonableSize = s.size >= MIN_PNG_SIZE;

    if (checks.reasonableSize) {
      pngInfo = await parsePNG(filePath);
      checks.pngSignature = pngInfo.signatureValid;
      checks.ihdrPresent = pngInfo.ihdrPresent;
    }
  } catch (e) {
    error = e.message;
  }

  const allPassed = Object.values(checks).every(Boolean);

  return {
    file: filePath,
    valid: allPassed,
    checks,
    png: pngInfo,
    error,
  };
}

/* ── Prompt-Image Alignment Check (Codex Vision via OAuth) ── */
export async function alignCheck(filePath, prompt, oauthUrl = "http://127.0.0.1:10531", threshold = 9) {
  try {
    const imageBuffer = await readFile(filePath);
    const base64Image = imageBuffer.toString("base64");
    const dataUri = `data:image/png;base64,${base64Image}`;

    const reviewPrompt = `You are an expert image quality evaluator. The image was generated from this prompt: "${prompt}".

Rate how well the image matches the prompt on a scale of 1-10, where 10 is a perfect match.

Respond ONLY in JSON format exactly like this (no markdown, no extra text):
{"score":8,"explanation":"Brief one-sentence reason."}`;

    const res = await fetch(`${oauthUrl}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        model: "gpt-5.5",
        input: [
          { role: "user", content: [
            { type: "input_image", image_url: dataUri },
            { type: "input_text", text: reviewPrompt },
          ]},
        ],
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { available: false, error: `Codex returned ${res.status}: ${text.slice(0, 200)}`, prompt };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

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
          if (data.type === "response.output_text.delta") fullText += data.delta || "";
        } catch {}
      }
    }

    // Extract JSON
    const jsonMatch = fullText.match(/\{[\s\S]*?\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : fullText;
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      result = { score: null, explanation: fullText };
    }

    return {
      available: true,
      score: result.score ?? null,
      explanation: result.explanation ?? "",
      prompt,
      model: "gpt-5.5",
      passed: (result.score ?? 0) >= threshold,
      threshold,
    };
  } catch (err) {
    return { available: false, error: err.message, prompt };
  }
}

/* ── Vision Quality Check (GLM-5.1 via ZAI) ── */
async function visionCheck(filePath, prompt) {
  const apiKey = process.env.ZAI_API_KEY || process.env.GLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      available: false,
      note: "Vision quality check requires an API key. Set ZAI_API_KEY or GLM_API_KEY environment variable.",
      prompt,
    };
  }

  try {
    const imageBuffer = await readFile(filePath);
    const base64Image = imageBuffer.toString("base64");
    const dataUri = `data:image/png;base64,${base64Image}`;

    const reviewPrompt = `You are an expert image quality evaluator. The image was generated from this prompt: "${prompt}".

Evaluate the image on these criteria (score 1-10 each):
1. Prompt Adherence: Does the image match the requested content, style, and composition?
2. Visual Quality: Are details sharp, lighting natural, colors vivid?
3. Artifact-Free: Are there blurs, deformities, extra limbs, watermarks, or text artifacts?

Respond in JSON format exactly like this:
{
  "prompt_adherence": 8,
  "visual_quality": 7,
  "artifact_free": 9,
  "overall": 8,
  "reasoning": "Brief explanation here."
}`;

    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "glm-5.1",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUri } },
              { type: "text", text: reviewPrompt },
            ],
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { available: false, error: `GLM API returned ${res.status}: ${text.slice(0, 200)}`, prompt };
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "";

    // Extract JSON from markdown code block if present
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;

    let scores;
    try {
      scores = JSON.parse(jsonStr);
    } catch {
      scores = { raw_response: content };
    }

    return {
      available: true,
      scores,
      prompt,
      model: "glm-5.1",
    };
  } catch (err) {
    return { available: false, error: err.message, prompt };
  }
}

/* ── CLI ── */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { input: "", vision: false, prompt: "", verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input") parsed.input = args[i + 1] || "";
    else if (args[i] === "--vision") parsed.vision = true;
    else if (args[i] === "--prompt") parsed.prompt = args[i + 1] || "";
    else if (args[i] === "--verbose") parsed.verbose = true;
  }
  if (!parsed.input) {
    console.error("Usage: node verify.js --input <image-path> [--vision] [--prompt <text>] [--verbose]");
    process.exit(1);
  }
  return parsed;
}

async function main() {
  const args = parseArgs();

  console.log(`[verify] Checking: ${args.input}`);
  const result = await validateImage(args.input);

  if (args.verbose) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const status = result.valid ? "✅ VALID" : "❌ INVALID";
    console.log(`[verify] ${status}: ${args.input}`);
    if (!result.valid) {
      for (const [check, passed] of Object.entries(result.checks)) {
        if (!passed) console.log(`       - failed: ${check}`);
      }
    }
    if (result.png?.dimensions) {
      console.log(`       dimensions: ${result.png.dimensions.width}x${result.png.dimensions.height}`);
    }
  }

  if (args.vision) {
    const v = await visionCheck(args.input, args.prompt);
    if (args.verbose) {
      console.log(JSON.stringify({ visionCheck: v }, null, 2));
    }
  }

  process.exit(result.valid ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error("[verify] Error:", e.message); process.exit(1); });
}
