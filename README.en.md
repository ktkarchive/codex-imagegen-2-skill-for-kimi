# codex-imagegen-2-skill-for-kimi

A Kimi CLI skill for image generation using OpenAI's Codex OAuth proxy. Generate images from text prompts or transform existing images — all via your ChatGPT Plus/Pro subscription.

## Requirements

- **Node.js** >= 18
- **ChatGPT Plus or Pro** subscription
- **Kimi CLI**

## Prerequisites

1. Log in to Codex CLI to create an OAuth session:
   ```bash
   npx @openai/codex login
   ```
   This creates `~/.codex/auth.json` which the skill uses for authentication.

2. The skill auto-starts an OAuth proxy on port `10531` when needed.

## Installation

### Option A: As a Kimi CLI Skill (Recommended)

```bash
cd ~/.kimi/skills/
git clone https://github.com/ktkarchive/codex-imagegen-2-skill-for-kimi.git
codex-imagegen-2-skill-for-kimi
```

Then tell Kimi: "generate an image of a cat in space"

### Option B: Standalone Scripts

```bash
cd scripts/

# Generate from text
node generate.js --prompt "a cyberpunk city at night" --quality high --size 1024x1024 --n 2

# Edit an existing image
node edit.js --input photo.png --prompt "turn into watercolor painting" --quality high --out result.png

# Verify a generated image
node verify.js --input result.png --verbose
```

## Configuration

Edit `config.json` to set defaults:

```json
{
  "default_quality": "high",
  "default_size": "1024x1024",
  "default_format": "png",
  "output_dir": "~/Pictures/codex-images"
}
```

| Option | Values | Description |
|--------|--------|-------------|
| `quality` | `low`, `medium`, `high` | Image quality level |
| `size` | `1024x1024`, `1024x1536`, `1536x1024` | Resolution and aspect ratio |
| `format` | `png`, `jpeg`, `webp` | Output format |
| `n` | 1–8 | Number of parallel generations |

## Output

Generated images are saved to `~/Pictures/codex-images/` (or your configured `output_dir`).

## Scripts

| Script | Purpose |
|--------|---------|
| `generate.js` | Text → Image generation |
| `edit.js` | Image → Image transformation |
| `verify.js` | PNG validity check (corruption, dimensions) |

## Features

- **Auto OAuth Proxy**: Starts automatically when needed, cleans up on exit
- **Retry Logic**: Up to 3 automatic retries if proxy fails to start
- **Parallel Generation**: Generate up to 8 images simultaneously
- **PNG Verification**: Automatic integrity check after generation
- **History Logging**: All generations logged to `history.jsonl`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No OAuth session" | Run `npx @openai/codex login` |
| "Proxy failed to start" | Kill port 10531: `lsof -ti:10531 \| xargs kill -9` |
| "401/403" error | OAuth expired, re-run `npx @openai/codex login` |
| "Rate limit" | Wait a few minutes and retry |

## License

MIT
