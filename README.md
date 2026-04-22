# codex-imagegen-2-skill-for-kimi

ChatGPT Plus/Pro 구독을 통해 OpenAI Codex OAuth 프록시로 이미지를 생성하는 Kimi CLI 스킬입니다. 텍스트 프롬프트로 이미지를 생성하거나, 기존 이미지를 스타일 변환할 수 있습니다.

## 요구사항

- **Node.js** >= 18
- **ChatGPT Plus 또는 Pro** 구독
- **Kimi CLI**

## 사전 준비

1. Codex CLI로 로그인하여 OAuth 세션을 생성합니다:
   ```bash
   npx @openai/codex login
   ```
   이 명령은 `~/.codex/auth.json`을 생성하며, 스킬이 이 파일로 인증합니다.

2. 스킬은 필요할 때 자동으로 포트 `10531`에 OAuth 프록시를 시작합니다.

## 설치

### 방법 A: Kimi CLI 스킬로 설치 (권장)

```bash
cd ~/.kimi/skills/
git clone https://github.com/ktkarchive/codex-imagegen-2-skill-for-kimi.git
codex-imagegen-2-skill-for-kimi
```

이후 Kimi에게 다음처럼 말하세요: "우주에 있는 고양이 이미지를 생성해줘"

### 방법 B: 독립 실행형 스크립트로 사용

```bash
cd scripts/

# 텍스트로 이미지 생성
node generate.js --prompt "사이버펑크 도시의 밤" --quality high --size 1024x1024 --n 2

# 기존 이미지 편집
node edit.js --input photo.png --prompt "수채화 그림으로 바꿔줘" --quality high --out result.png

# 생성된 이미지 검증
node verify.js --input result.png --verbose
```

## 설정

`config.json`을 수정하여 기본값을 설정할 수 있습니다:

```json
{
  "default_quality": "high",
  "default_size": "1024x1024",
  "default_format": "png",
  "output_dir": "~/Pictures/codex-images"
}
```

| 옵션 | 값 | 설명 |
|------|-----|------|
| `quality` | `low`, `medium`, `high` | 이미지 품질 수준 |
| `size` | `1024x1024`, `1024x1536`, `1536x1024` | 해상도 및 비율 |
| `format` | `png`, `jpeg`, `webp` | 출력 포맷 |
| `n` | 1–8 | 병렬 생성 개수 |

## 출력 경로

생성된 이미지는 `~/Pictures/codex-images/` (또는 설정한 `output_dir`)에 저장됩니다.

## 스크립트 목록

| 스크립트 | 용도 |
|----------|------|
| `generate.js` | 텍스트 → 이미지 생성 |
| `edit.js` | 이미지 → 이미지 스타일 변환 |
| `verify.js` | PNG 유효성 검사 (손상, 크기 등) |

## 문제 해결

| 문제 | 해결 방법 |
|------|-----------|
| "No OAuth session" | `npx @openai/codex login` 실행 |
| "Proxy failed to start" | 포트 10531 정리: `lsof -ti:10531 \| xargs kill -9` |
| "401/403" 오류 | OAuth 만료, `npx @openai/codex login` 재실행 |
| "Rate limit" | 몇 분 기다린 후 재시도 |

## 특징

- **자동 OAuth 프록시**: 필요할 때 자동 시작, 종료 시 정리
- **재시도 로직**: 프록시 시작 실패 시 최대 3회 자동 재시도
- **병렬 생성**: 한 번에 최대 8장 동시 생성
- **PNG 검증**: 생성 후 자동으로 파일 무결성 검사
- **히스토리**: 모든 생성 이력을 `history.jsonl`에 기록

## 라이선스

MIT
