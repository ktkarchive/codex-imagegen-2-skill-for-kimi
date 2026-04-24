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

/**
 * Detect if the prompt already looks structured (has Scene/Subject/Details labels).
 * If so, skip heavy reprocessing and only append missing constraints.
 */
function isStructured(prompt) {
  const markers = /\b(Scene|Subject|Use case|Constraints|Details|Output):/i;
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
    .replace(/\b(generate|create|make|draw|paint|render|produce)\s+(an?|the|me|a)\s*/gi, "")
    .replace(/\b(image|picture|photo|photograph|illustration)\s+of\s+/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/\bfor me\b/gi, "")
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
  if (/\b(sunrise|dawn|morning|아침)\b/.test(p)) scenes.push("sunrise lighting, early morning atmosphere");
  else if (/\b(golden hour|sunset| dusk|evening|저녁|노을)\b/.test(p)) scenes.push("golden hour, warm sunset atmosphere");
  else if (/\b(night|midnight|dark|nighttime|밤|야간)\b/.test(p)) scenes.push("nighttime setting, dark atmospheric background");
  else if (/\b(blue hour|twilight|블루아워)\b/.test(p)) scenes.push("blue hour, twilight atmosphere");

  // Environment
  if (/\b(studio|white background|클린|흰색 배경)\b/.test(p)) scenes.push("clean studio environment, neutral background");
  else if (/\b(outdoor|outside|야외|바깥)\b/.test(p)) scenes.push("outdoor natural environment");
  else if (/\b(indoor|inside|interior|실내|낭\b)/.test(p)) scenes.push("indoor interior setting");
  else if (/\b(urban|city|street|도시|거리)\b/.test(p)) scenes.push("urban city environment");
  else if (/\b(nature|forest|jungle|meadow|nature|숲|자연)\b/.test(p)) scenes.push("natural outdoor environment");

  // Concert / event specific (from sangpye experience)
  if (/\b(concert|stage|performance|공연|묘대|콘서트)\b/.test(p)) scenes.push("concert stage with dramatic lighting, crowd energy");

  if (scenes.length === 0) return null;
  return scenes.join("; ");
}

/**
 * Infer style/medium from prompt.
 */
function inferStyle(prompt) {
  const p = prompt.toLowerCase();
  if (/\b(photoreal|photo realistic|real photo|realistic|사진|리얼|실사)\b/.test(p)) return "photorealistic";
  if (/\b(3d|render|blender|c4d|octane|3d 렌더)\b/.test(p)) return "3D render";
  if (/\b(watercolor|water colour|수채화)\b/.test(p)) return "watercolor painting";
  if (/\b(oil paint|oil painting|유화)\b/.test(p)) return "oil painting";
  if (/\b(pixel art|pixelart|픽셀아트)\b/.test(p)) return "pixel art";
  if (/\b(anime|manga|cartoon|animation|애니|만화)\b/.test(p)) return "anime-style illustration";
  if (/\b(sketch|pencil|line art|drawing|스케치|선화)\b/.test(p)) return "pencil sketch";
  if (/\b(digital art|digital painting|디지털)\b/.test(p)) return "digital painting";
  if (/\b(cinematic|film still|movie|영화|시네마틱)\b/.test(p)) return "cinematic film still";
  return "photorealistic"; // default
}

/**
 * Infer lighting from prompt.
 */
function inferLighting(prompt) {
  const p = prompt.toLowerCase();
  if (/\b(soft light|softbox|diffuse|소프트|부드러운 빛)\b/.test(p)) return "soft diffused lighting";
  if (/\b(harsh|hard light|direct sun|강한 빛|직사광선)\b/.test(p)) return "harsh direct lighting";
  if (/\b(neon|cyberpunk|네온|사이버)\b/.test(p)) return "neon lighting, cyberpunk atmosphere";
  if (/\b(candle|warm|cozy|fire|촛불|따뜻한)\b/.test(p)) return "warm candlelight atmosphere";
  if (/\b(studio|스튜디오)\b/.test(p)) return "professional studio lighting";
  if (/\b(natural light|window light|창문|자연광)\b/.test(p)) return "natural window light";
  if (/\b(dramatic|chiaroscuro|드라마틱)\b/.test(p)) return "dramatic chiaroscuro lighting";
  if (/\b(red light|붉은|빨간)\b/.test(p)) return "dramatic red-toned lighting";
  return null;
}

/**
 * Infer composition from prompt.
 */
function inferComposition(prompt) {
  const p = prompt.toLowerCase();
  const comps = [];
  if (/\b(close-up|macro|extreme close|클로즈업|접사)\b/.test(p)) comps.push("close-up framing");
  else if (/\b(medium shot|waist up|미디엄)\b/.test(p)) comps.push("medium shot");
  else if (/\b(wide shot|full body|long shot|와이드|전신)\b/.test(p)) comps.push("wide shot, full body visible");
  else if (/\b(overhead|top.down|flat lay|평면|탑뷰)\b/.test(p)) comps.push("overhead top-down view");

  if (/\b(centered|center|중앙|가운데)\b/.test(p)) comps.push("centered composition");
  else if (/\b(rule of thirds|off center|삼분할)\b/.test(p)) comps.push("rule of thirds composition");
  else if (/\b(symmetrical|symmetry|대칭)\b/.test(p)) comps.push("symmetrical composition");

  if (/\b(shallow depth|bokeh|blur background|아웃포커싱)\b/.test(p)) comps.push("shallow depth of field");
  if (/\b(negative space|minimal|simple|미니멀|여백)\b/.test(p)) comps.push("minimal composition with negative space");

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

  // Build sections
  const sections = [];

  // 1. Use case
  sections.push(`Use case: ${useCase}.`);

  // 2. Subject — FRONT-LOADED (most critical for model attention)
  // We also prepend style to the subject line so the first words carry weight
  let subjectLine = style ? `${style}. ${subject}` : subject;
  sections.push(`Subject: ${subjectLine}.`);

  // 3. Scene
  if (scene) {
    sections.push(`Scene: ${scene}.`);
  }

  // 4. Important details (style, lighting, composition, materials)
  const details = [];
  if (style && !subjectLine.includes(style)) details.push(style);
  if (lighting) details.push(lighting);
  if (composition) details.push(composition);

  // Quality boosters (only for generate mode)
  if (mode === "generate") {
    details.push("high-quality rendering: " + QUALITY_BOOSTERS.join(", "));
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
