# codex-imagegen-2-skill-for-kimi

Generate and edit images through **OpenAI Codex OAuth** using your **ChatGPT Plus/Pro** subscription. No API key. No per-image billing.

Originally built for [Kimi CLI](https://github.com/OpenKimi/Kimi-CLI), but works with any agent or CLI that can run shell commands — including **Claude Code**, **OpenCode**, **Hermes Agent**, **OpenClo**, or your own custom agent framework.

> 🌐 [한국어 README](README.ko.md)

---

## What Makes This Different

> Based on [OpenAI's official GPT Image 2 prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide).

| Feature | Other Skills | This Skill |
|---------|-------------|------------|
| **Prompt Engineering** | Raw user prompt passed as-is | ✅ **Auto-structured** into OpenAI's official GPT Image 2 format (8-step: Use case → Subject → Scene → Details → Constraints → Output) |
| **Verification** | None or manual check | ✅ **PNG validation** (signature, dimensions, corruption detection) + optional prompt-image alignment scoring |
| **Billing** | Per-image API costs | ✅ **Free** via ChatGPT Plus/Pro OAuth |
| **Model** | Fixed gpt-image-1 or DALL-E | ✅ **gpt-5.5** orchestrator + image_generation tool (latest Codex) |
| **Editing** | Not supported | ✅ **Reference-image editing** with style transfer, background swap, object replacement |

### Prompt Enhancement Engine

Your vague idea → **production-ready structured brief** automatically:

```
User: "cute cat on a desk looking at a laptop"

Enhanced:
Use case: general image generation.

Subject: Cute cat on a desk looking at a laptop.

Important details: high-quality rendering: masterpiece, best quality, ultra detailed, 8k UHD, sharp focus.

Constraints: no watermark; no signature; no text artifacts unless explicitly requested; no logos or trademarks unless specified; no extra limbs; no deformed anatomy.

Output: high-resolution image, crisp details, professional finish.
```

The engine auto-detects **use case** (advertisement, portrait, product, illustration, etc.), **scene** (golden hour, studio, concert), **lighting**, and **composition** from your natural-language input.

---

## Requirements

- **Node.js** >= 18
- **ChatGPT Plus or Pro** subscription
- **Kimi CLI** (optional, for agent-mode usage)

## Setup

1. Log in with Codex CLI to create an OAuth session:
   ```bash
   npx @openai/codex login
   ```
   This creates `~/.codex/auth.json`, which the skill uses for authentication.

2. The skill automatically starts an OAuth proxy on port `10531` when needed.

## Installation

### Method A: As a Kimi CLI Skill (Recommended)

```bash
cd ~/.kimi/skills/
git clone https://github.com/ktkarchive/codex-imagegen-2-skill-for-kimi.git
```

Then tell Kimi: "Generate an image of a cat in space"

### Method B: Standalone Scripts

```bash
cd scripts/

# Text → Image
node generate.js --prompt "cyberpunk city at night" --quality high --size 1024x1024 --n 2

# Image → Image (style transfer / edit)
node edit.js --input photo.png --prompt "turn into watercolor painting" --quality high --out result.png

# Verify generated image
node verify.js --input result.png --verbose

# Enable prompt-image alignment check (auto-retry if score < 7/10)
node generate.js --prompt "cyberpunk city at night" --quality high --align-check
```

## Configuration

Create `config.json` in the skill root to set defaults:

```json
{
  "default_quality": "high",
  "default_size": "1024x1024",
  "default_format": "png",
  "output_dir": "~/Pictures/codex-images",
  "align_threshold": 8
}
```

| Option | Values | Description |
|--------|--------|-------------|
| `quality` | `low`, `medium`, `high` | Image quality level |
| `size` | `1024x1024`, `1024x1536`, `1536x1024` | Resolution and aspect ratio |
| `format` | `png`, `jpeg`, `webp` | Output format |
| `n` | 1–8 | Parallel generation count |
| `align_check` | `true`, `false` | Enable prompt-image alignment verification (default: `true`) |
| `align_threshold` | `1`–`10` | Minimum alignment score to pass (default: `7`) |

## Output

Generated images are saved to `~/Pictures/codex-images/` (or your configured `output_dir`).

## Scripts

| Script | Purpose |
|--------|---------|
| `generate.js` | Text → Image generation |
| `edit.js` | Image → Image style transfer & editing |
| `verify.js` | PNG validation (signature, dimensions, corruption) |
| `prompt_enhancer.js` | Auto-structures user prompts into GPT Image 2 format |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No OAuth session" | Run `npx @openai/codex login` |
| "Proxy failed to start" | Clear port 10531: `lsof -ti:10531 \| xargs kill -9` |
| "401/403" error | OAuth expired, re-run `npx @openai/codex login` |
| "Rate limit" | Wait a few minutes and retry |

## Prompt-Image Alignment Verification (Optional)

By default, alignment checking is **disabled** to keep generation fast and avoid extra API calls.

By default, alignment checking is **enabled** for every generation. To disable it for faster generation, use `--no-align-check` or set `config.align_check: false`.

When active, the skill will:
1. Generate the image
2. Send it to a vision-capable LLM (Codex `gpt-5.5`) with the prompt
3. Receive a 1–10 alignment score + explanation
4. **Auto-retry once** if the score is below 7/10, incorporating the feedback into the next prompt

> **Note:** This feature requires an active Codex OAuth session and adds ~10–20s per image. Recommended for high-stakes deliverables where prompt fidelity is critical.

## How It Works

1. **Prompt Analysis** — `prompt_enhancer.js` parses your natural-language input and infers use case, scene, lighting, and composition.
2. **Structuring** — Rebuilds the prompt into OpenAI's recommended GPT Image 2 format (Scene → Subject → Details → Constraints).
3. **Generation** — Sends the structured brief to Codex (`gpt-5.5` + `image_generation` tool) via your ChatGPT OAuth session.
4. **Verification** — `verify.js` checks the downloaded PNG for corruption, correct dimensions, and valid signature.
5. **Alignment Check** *(optional)* — `alignCheck()` uses a vision model to score prompt fidelity; retries once if misaligned.
6. **History** — Every generation is logged to `history.jsonl` with prompt, parameters, and output path.

## License

MIT

---

*Last updated: 2026-04-24*
