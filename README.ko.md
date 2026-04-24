# codex-imagegen-2-skill-for-kimi

**ChatGPT Plus/Pro** 구독을 통해 **OpenAI Codex OAuth**로 이미지를 생성하는 Kimi CLI 스킬입니다. API 키 없이, 이미지당 과금 없이 사용할 수 있습니다.

> 🌐 [English README](README.md)

---

## 다른 스킬과의 차이점

| 기능 | 다른 스킬 | 이 스킬 |
|------|----------|--------|
| **프롬프트 엔지니어링** | 사용자 프롬프트 그대로 전달 | ✅ **OpenAI 공식 GPT Image 2 가이드 기반 8단계 자동 구조화** (목적→주제→장면→세부사항→제약→출력) |
| **검증 시스템** | 없음 또는 수동 확인 | ✅ **PNG 유효성 검사** (시그니처, 크기, 손상 탐지) + 선택적 프롬프트-이미지 일치도 평가 |
| **비용** | 이미지당 API 과금 | ✅ **ChatGPT Plus/Pro OAuth로 물** |
| **모델** | 고정 gpt-image-1 또는 DALL-E | ✅ **gpt-5.5** 오케스트레이터 + image_generation 툴 (최신 Codex) |
| **편집** | 미지원 | ✅ **참조 이미지 기반 편집** — 스타일 변환, 배경 교체, 오브젝트 교체 |

### 프롬프트 자동 교정 엔진

당신의 대충 된 아이디어 → **자동으로 생산-ready 구조화 브리프**:

```
사용자: "책상 위에서 노트북을 보는 귀여운 고양이"

교정 후:
Use case: general image generation.

Subject: 책상 위에서 노트북을 보는 귀여운 고양이.

Important details: high-quality rendering: masterpiece, best quality, ultra detailed, 8k UHD, sharp focus.

Constraints: no watermark; no signature; no text artifacts unless explicitly requested; no logos or trademarks unless specified; no extra limbs; no deformed anatomy.

Output: high-resolution image, crisp details, professional finish.
```

엔진은 자연어 입력에서 **용도** (광고, 인물, 제품, 일러스트 등), **장면** (골든아워, 스튜디오, 콘서트), **조명**, **구도**를 자동 추론합니다.

---

## 요구사항

- **Node.js** >= 18
- **ChatGPT Plus 또는 Pro** 구독
- **Kimi CLI** (선택, 에이전트 모드 사용 시)

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
```

이후 Kimi에게 다음처럼 말하세요: "우주에 있는 고양이 이미지를 생성해줘"

### 방법 B: 독립 실행형 스크립트로 사용

```bash
cd scripts/

# 텍스트로 이미지 생성
node generate.js --prompt "사이버펑크 도시의 밤" --quality high --size 1024x1024 --n 2

# 기존 이미지 편집 (스타일 변환)
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
| `edit.js` | 이미지 → 이미지 스타일 변환 및 편집 |
| `verify.js` | PNG 유효성 검사 (시그니처, 크기, 손상 탐지) |
| `prompt_enhancer.js` | 사용자 프롬프트를 GPT Image 2 형식으로 자동 구조화 |

## 문제 해결

| 문제 | 해결 방법 |
|------|-----------|
| "No OAuth session" | `npx @openai/codex login` 실행 |
| "Proxy failed to start" | 포트 10531 정리: `lsof -ti:10531 \| xargs kill -9` |
| "401/403" 오류 | OAuth 만료, `npx @openai/codex login` 재실행 |
| "Rate limit" | 몇 분 기다린 후 재시도 |

## 동작 원리

1. **프롬프트 분석** — `prompt_enhancer.js`가 자연어 입력을 파싱하여 용도, 장면, 조명, 구도를 추론합니다.
2. **구조화** — OpenAI 권장 GPT Image 2 형식(장면→주제→세부사항→제약)으로 프롬프트를 재구성합니다.
3. **생성** — 구조화된 브리프를 Codex(`gpt-5.5` + `image_generation` 툴)에 전달하여 이미지를 생성합니다.
4. **검증** — `verify.js`가 다운로드된 PNG의 손상 여부, 올바른 크기, 유효한 시그니처를 확인합니다.
5. **히스토리** — 모든 생성 이력을 `history.jsonl`에 프롬프트, 파라미터, 출력 경로와 함께 기록합니다.

## 라이선스

MIT
