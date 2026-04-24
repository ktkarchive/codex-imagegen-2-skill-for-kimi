/**
 * Prompt Enhancer for GPT Image 2.0
 * Transforms user's rough input into a structured prompt following
 * OpenAI's official GPT Image 2 prompting best practices.
 *
 * Structure (8-step, mapped to OpenAI guide):
 *   1. Use case      → 목적/용도
 *   2. Subject       → 핵심 브리프 (FRONT-LOADED — first 10-15 words = 80% attention)
 *   3. Scene         → 맥락/환경
 *   4. Details       → 필수 요소 + 구도/공간관계 + 빛/색/재질
 *   5. Constraints   → 제약/금지/고려
 *   6. Output        → 출력/포맷
 */

const DEFAULT_CONSTRAINTS = [
  "no watermark",
  "no signature",
  "no text artifacts unless explicitly requested",
  "no logos or trademarks unless specified",
  "no extra limbs",
  "no deformed anatomy",
];

const QUALITY_BOOSTERS = [
  "masterpiece",
  "best quality",
  "ultra detailed",
  "8k UHD",
  "sharp focus",
];

const STYLE_BOOSTERS = {
  illustration: "clean linework, vibrant colors, expressive character design, stylized illustration",
  "watercolor painting": "soft watercolor washes, textured paper, delicate brushstrokes, painterly",
  "3D render": "physically based rendering, realistic materials, proper lighting, clean geometry",
  "oil painting": "rich impasto texture, classical composition, warm palette, gallery quality",
  "pixel art": "crisp pixel edges, limited palette, retro aesthetic, dithering",
  "anime-style illustration": "cel shading, vibrant colors, clean linework, expressive eyes",
  "pencil sketch": "graphite texture, cross-hatching, sketch paper grain, loose strokes",
  "digital painting": "digital brushwork, layered colors, concept art quality, dramatic lighting",
  "cinematic film still": "anamorphic lens, film grain, color grading, cinematic composition",
};

/**
 * Detect if the prompt already looks structured (has Scene/Subject/Details labels).
 * If so, skip heavy reprocessing and only append missing constraints.
 */
function isStructured(prompt) {
  const markers = /(Scene|Subject|Use case|Constraints|Details|Output):/i;
  return markers.test(prompt);
}

/**
 * Infer use case from prompt keywords.
 */
function inferUseCase(prompt) {
  const p = prompt.toLowerCase();
  if (/(ad|advertisement|banner|poster|billboard|promo|promotion|광고|포스터|배너)/.test(p)) return "advertisement / promotional poster";
  if (/(product|item|bottle|package|캔|병|제품)/.test(p)) return "product photography / mockup";
  if (/(portrait|headshot|selfie|인물|초상화)/.test(p)) return "portrait photography";
  if (/(logo|icon|emblem|로고|아이콘)/.test(p)) return "logo / icon design";
  if (/(ui|interface|mockup|screenshot|screen|앱|웹)/.test(p)) return "UI mockup / interface design";
  if (/(infographic|chart|diagram|인포그래픽|차트)/.test(p)) return "infographic";
  if (/(illustration|drawing|sketch|artwork|그림|일러스트)/.test(p)) return "illustration";
  if (/(food|cuisine|dish|meal|음식|요리)/.test(p)) return "food photography";
  if (/(fashion|outfit|clothing|dress|옷|패션)/.test(p)) return "fashion photography";
  if (/(landscape|scenery|nature|mountain|ocean|풍경|자연)/.test(p)) return "landscape photography";
  if (/(concept art|concept|game|character|캐릭터|컨셉)/.test(p)) return "concept art";
  return "general image generation";
}

/**
 * Extract subject by trimming fluff and keeping the core noun phrase.
 * Front-loads the most visually important element.
 */
function extractSubject(prompt) {
  // Remove action verbs that dilute the subject
  let s = prompt
    .replace(/(generate|create|make|draw|paint|render|produce)\s+(an?|the|me|a)\s*/gi, "")
    .replace(/(image|picture|photo|photograph|illustration)\s+of\s+/gi, "")
    .replace(/please/gi, "")
    .replace(/for me/gi, "")
    .trim();

  // Capitalize first letter for professionalism
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Infer scene/context from prompt.
 */
function inferScene(prompt) {
  const p = prompt.toLowerCase();
  const scenes = [];

  // Time of day
  if (/(sunrise|dawn|morning|아침)/.test(p)) scenes.push("sunrise lighting, early morning atmosphere");
  else if (/(golden hour|sunset| dusk|evening|저녁|노을)/.test(p)) scenes.push("golden hour, warm sunset atmosphere");
  else if (/(night|midnight|dark|nighttime|밤|야간)/.test(p)) scenes.push("nighttime setting, dark atmospheric background");
  else if (/(blue hour|twilight|블루아워)/.test(p)) scenes.push("blue hour, twilight atmosphere");

  // Environment
  if (/(studio|white background|클린|흰색 배경)/.test(p)) scenes.push("clean studio environment, neutral background");
  else if (/(outdoor|outside|야외|바깥)/.test(p)) scenes.push("outdoor natural environment");
  else if (/(indoor|inside|interior|실내|낭)/.test(p)) scenes.push("indoor interior setting");
  else if (/(urban|city|street|도시|거리)/.test(p)) scenes.push("urban city environment");
  else if (/(nature|forest|jungle|meadow|nature|숲|자연)/.test(p)) scenes.push("natural outdoor environment");

  // Concert / event specific (from sangpye experience)
  if (/(concert|stage|performance|공연|묘대|콘서트)/.test(p)) scenes.push("concert stage with dramatic lighting, crowd energy");

  if (scenes.length === 0) return null;
  return scenes.join("; ");
}

/**
 * Infer style/medium from prompt.
 */
function inferStyle(prompt) {
  const p = prompt.toLowerCase();
  if (/(illustration|artwork|그림|일러스트)/.test(p)) return "illustration";
  if (/(photoreal|photo realistic|real photo|realistic|사진|리얼|실사)/.test(p)) return "photorealistic";
  if (/(3d|render|blender|c4d|octane|3d 렌더)/.test(p)) return "3D render";
  if (/(watercolor|water colour|수채화)/.test(p)) return "watercolor painting";
  if (/(oil paint|oil painting|유화)/.test(p)) return "oil painting";
  if (/(pixel art|pixelart|픽셀아트)/.test(p)) return "pixel art";
  if (/(anime|manga|cartoon|animation|애니|만화)/.test(p)) return "anime-style illustration";
  if (/(sketch|pencil|line art|drawing|스케치|선화)/.test(p)) return "pencil sketch";
  if (/(digital art|digital painting|디지털)/.test(p)) return "digital painting";
  if (/(cinematic|film still|movie|영화|시네마틱)/.test(p)) return "cinematic film still";
  return "photorealistic"; // default
}

/**
 * Infer lighting from prompt.
 */
function inferLighting(prompt) {
  const p = prompt.toLowerCase();
  if (/(soft light|softbox|diffuse|소프트|부드러운 빛)/.test(p)) return "soft diffused lighting";
  if (/(harsh|hard light|direct sun|강한 빛|직사광선)/.test(p)) return "harsh direct lighting";
  if (/(neon|cyberpunk|네온|사이버)/.test(p)) return "neon lighting, cyberpunk atmosphere";
  if (/(candle|warm|cozy|fire|촛불|따뜻한)/.test(p)) return "warm candlelight atmosphere";
  if (/(studio|스튜디오)/.test(p)) return "professional studio lighting";
  if (/(natural light|window light|창문|자연광)/.test(p)) return "natural window light";
  if (/(dramatic|chiaroscuro|드라마틱)/.test(p)) return "dramatic chiaroscuro lighting";
  if (/(red light|붉은|빨간)/.test(p)) return "dramatic red-toned lighting";
  return null;
}

/**
 * Infer composition from prompt.
 */
function inferComposition(prompt) {
  const p = prompt.toLowerCase();
  const comps = [];
  if (/(close-up|macro|extreme close|클로즈업|접사)/.test(p)) comps.push("close-up framing");
  else if (/(medium shot|waist up|미디엄)/.test(p)) comps.push("medium shot");
  else if (/(wide shot|full body|long shot|와이드|전신)/.test(p)) comps.push("wide shot, full body visible");
  else if (/(overhead|top.down|flat lay|평면|탑뷰)/.test(p)) comps.push("overhead top-down view");

  if (/(centered|center|중앙|가운데)/.test(p)) comps.push("centered composition");
  else if (/(rule of thirds|off center|삼분할)/.test(p)) comps.push("rule of thirds composition");
  else if (/(symmetrical|symmetry|대칭)/.test(p)) comps.push("symmetrical composition");

  if (/(shallow depth|bokeh|blur background|아웃포커싱)/.test(p)) comps.push("shallow depth of field");
  if (/(negative space|minimal|simple|미니멀|여백)/.test(p)) comps.push("minimal composition with negative space");

  return comps.length > 0 ? comps.join("; ") : null;
}

/**
 * Detect explicit text requests in prompt.
 */
function extractExplicitText(prompt) {
  const quoted = prompt.match(/"([^"]+)"/g);
  if (quoted && quoted.length > 0) {
    return quoted.map(q => q.replace(/"/g, ""));
  }
  return null;
}

/**
 * Main entry point.
 *
 * @param {string} userPrompt - Raw user input
 * @param {object} options
 *   @param {string} options.mode - "generate" | "edit"
 *   @param {string} options.quality - "low" | "medium" | "high"
 *   @param {string} options.size - "1024x1024" etc.
 * @returns {string} - Enhanced structured prompt
 */
export function enhancePrompt(userPrompt, options = {}) {
  const { mode = "generate" } = options;

  // If already structured, only append missing constraints
  if (isStructured(userPrompt)) {
    return userPrompt + "\n\nConstraints: " + DEFAULT_CONSTRAINTS.join("; ") + ".";
  }

  const useCase = inferUseCase(userPrompt);
  const subject = extractSubject(userPrompt);
  const scene = inferScene(userPrompt);
  const style = inferStyle(userPrompt);
  const lighting = inferLighting(userPrompt);
  const composition = inferComposition(userPrompt);
  const explicitTexts = extractExplicitText(userPrompt);

  // Override: if user explicitly mentions a style keyword, don't force photorealistic fallback
  const EXPLICIT_STYLE_KEYWORDS = [
    "일러스트", "illustration", "anime", "만화", "cartoon",
    "sketch", "스케치", "watercolor", "수채화", "pixel art", "픽셀아트",
    "oil paint", "유화", "3d render", "3d 렌더", "digital art", "디지털",
    "pencil", "선화", "cinematic", "시네마틱", "film still",
  ];
  const hasExplicitStyle = EXPLICIT_STYLE_KEYWORDS.some(k =>
    userPrompt.toLowerCase().includes(k)
  );
  const effectiveStyle = hasExplicitStyle ? null : style;

  // Build sections
  const sections = [];

  // 1. Use case
  sections.push(`Use case: ${useCase}.`);

  // 2. Subject — FRONT-LOADED (most critical for model attention)
  // User's original wording is preserved; the model infers style from context.
  sections.push(`Subject: ${subject}.`);

  // 3. Scene
  if (scene) {
    sections.push(`Scene: ${scene}.`);
  }

  // 4. Important details (style, lighting, composition, materials)
  const details = [];
  if (effectiveStyle) details.push(effectiveStyle);
  if (lighting) details.push(lighting);
  if (composition) details.push(composition);

  // Quality boosters (style-aware, only for generate mode)
  if (mode === "generate") {
    const boosters = style && STYLE_BOOSTERS[style]
      ? STYLE_BOOSTERS[style]
      : QUALITY_BOOSTERS.join(", ");
    details.push("high-quality rendering: " + boosters);
  }

  // Explicit text handling
  if (explicitTexts) {
    details.push(`exact text to render: "${explicitTexts.join('", "')}" — render verbatim with clean typography`);
  }

  if (details.length > 0) {
    sections.push(`Important details: ${details.join("; ")}.`);
  }

  // 5. Constraints
  const constraints = [...DEFAULT_CONSTRAINTS];
  if (mode === "edit") {
    constraints.push("preserve original composition, subject identity, and pose exactly");
    constraints.push("only apply the requested transformation");
  }
  sections.push(`Constraints: ${constraints.join("; ")}.`);

  // 6. Output format hint
  sections.push(`Output: high-resolution image, crisp details, professional finish.`);

  return sections.join("\n\n");
}

/**
 * Debug helper: log the enhancement for transparency.
 */
export function logEnhancement(original, enhanced) {
  console.log("[prompt] ┌─ Original prompt ────────────────────────────────");
  console.log("[prompt] │ " + original.replace(/\n/g, "\n[prompt] │ "));
  console.log("[prompt] ├─ Enhanced prompt ────────────────────────────────");
  console.log("[prompt] │ " + enhanced.replace(/\n/g, "\n[prompt] │ "));
  console.log("[prompt] └───────────────────────────────────────────────────");
}
