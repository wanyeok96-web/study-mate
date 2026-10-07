// =====================================================================
// STUDY MATE - AI 개인화 리포트 Edge Function (study-profile-report)
// ---------------------------------------------------------------------
// 브라우저가 이미 계산한 STUDY STYLE(유형 + 점수)을 받아, AI 가 '설명 문장'만 작성합니다.
//   - AI 는 유형을 결정하지 않습니다. (서버에서 점수로 유형을 다시 계산해 일치하는지만 확인)
//   - 받는 값은 익명 값뿐입니다: 버전 · 유형 id · 점수 4개. (이름/학번/전화번호/성별/확인코드/팀 정보 없음)
//   - 요청 내용과 AI 결과는 저장하지 않고, 로그에도 남기지 않습니다.
//   - 실패/시간 초과/형식 오류 → 오류 응답 → 브라우저가 기본 설명(PROFILE_TYPES)으로 대체합니다.
//
// 배포
//   supabase secrets set AI_PROVIDER=openai AI_API_KEY=... AI_MODEL=<빠른 소형 모델명>
//   supabase secrets set ALLOWED_ORIGINS=https://<계정>.github.io
//   supabase functions deploy study-profile-report --no-verify-jwt
//   (선택) AI_BASE_URL : OpenAI 호환 API 주소 / AI_MAX_TOKENS : 기본 1200
//   ⚠️ AI API Key 는 Supabase Secret 으로만 관리합니다. script.js 에 절대 넣지 않습니다.
// =====================================================================

const PROFILE_VERSION = "1.0";
const REQUEST_MAX_BYTES = 2048;
const PROVIDER_TIMEOUT_MS = 4000;
const FIELD_MAX_LENGTH = 400;
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

// script.js 의 PROFILE_TYPES / BEST_MATE_MAP 과 같은 내용 (문구를 바꾸면 양쪽 모두 수정)
// 클라이언트가 보낸 설명 문장은 사용하지 않고, 여기 있는 기준 문구만 AI 에 전달합니다.
type ProfileType = {
  when: { exploration: Level; reflection: Level; relationship: Level };
  name: string;
  description: string;
  strength: string;
  studyRole: string;
  caution: string;
  asMate: string;
};
type Level = "high" | "low";
type Band = "low" | "balanced" | "high";

const PROFILE_TYPES: Record<string, ProfileType> = {
  careful_explorer: {
    when: { exploration: "high", reflection: "high", relationship: "low" },
    name: "신중한 탐구가",
    description: "새로운 내용을 접하면 먼저 직접 살펴보고 자신의 방식으로 정리하는 편. 답을 내기 전에 한 번 더 검토하고, 혼자 집중하는 시간을 중요하게 느낄 수 있음.",
    strength: "자료 분석, 핵심 정리, 놓친 부분 확인",
    studyRole: "자료 정리 · 오류 발견 · 핵심 개념 정리",
    caution: "생각하는 과정이 길어지면 시작이나 실행이 늦어질 수 있음",
    asMate: "먼저 직접 살펴보고 한 번 더 꼼꼼히 확인하는 친구",
  },
  strategic_collaborator: {
    when: { exploration: "high", reflection: "high", relationship: "high" },
    name: "전략적 협력가",
    description: "먼저 스스로 분석하고 생각을 정리한 뒤 친구들과 의견을 나누며 이해를 깊게 하는 편. 충분히 생각하고 함께 검토하는 과정을 편하게 느낄 수 있음.",
    strength: "자신의 생각과 다른 사람의 의견을 연결하고 정리",
    studyRole: "계획 세우기 · 의견 정리 · 팀 방향 잡기",
    caution: "모두가 충분히 생각한 뒤 움직이려 하면 실행이 늦어질 수 있음",
    asMate: "충분히 생각을 정리한 뒤 함께 의견을 맞춰가는 친구",
  },
  self_directed_executor: {
    when: { exploration: "high", reflection: "low", relationship: "low" },
    name: "자기주도 실행가",
    description: "스스로 필요한 정보를 찾고 방향을 정하는 것을 선호하고, 생각이 정리되면 빠르게 행동으로 옮기는 편.",
    strength: "과제 시작, 새로운 방법을 실제로 시도하는 추진력",
    studyRole: "문제 시작 · 과제 진행 · 새로운 방법 시도",
    caution: "빠르게 진행하다 보면 놓친 부분을 확인하는 과정이 필요할 수 있음",
    asMate: "스스로 방향을 정하고 일단 시작해보는 친구",
  },
  idea_executor: {
    when: { exploration: "high", reflection: "low", relationship: "high" },
    name: "아이디어 실행가",
    description: "스스로 해결 방법이나 아이디어를 찾는 것을 좋아하면서 함께 공부하는 과정에도 적극적인 편. 생각을 실제 활동으로 옮기며 발전시키는 경향.",
    strength: "아이디어 제안, 팀이 실제 활동을 시작하도록 만들기",
    studyRole: "아이디어 제안 · 활동 시작 · 팀 분위기 활성화",
    caution: "빠르게 움직이는 만큼 세부 내용을 다시 확인하는 시간이 있으면 좋음",
    asMate: "아이디어를 내고 팀과 함께 바로 움직여보는 친구",
  },
  feedback_designer: {
    when: { exploration: "low", reflection: "high", relationship: "low" },
    name: "피드백 설계가",
    description: "선생님이나 친구의 설명과 피드백을 활용하면서, 최종적으로는 혼자 내용을 정리하고 충분히 생각하는 시간을 편하게 느끼는 편.",
    strength: "설명이나 자료에서 핵심을 찾아 자신의 방식으로 다시 구조화",
    studyRole: "설명 정리 · 핵심 구조화 · 최종 검토",
    caution: "충분한 정보를 얻은 뒤 시작하려다 보면 행동 시점이 늦어질 수 있음",
    asMate: "설명을 잘 듣고 차분하게 내용을 정리하는 친구",
  },
  feedback_coordinator: {
    when: { exploration: "low", reflection: "high", relationship: "high" },
    name: "피드백 조율가",
    description: "다른 사람의 설명이나 의견을 활용하고 함께 이야기하며 이해하는 것을 선호하는 편. 바로 결론을 내리기보다 충분히 검토하려는 경향.",
    strength: "질문하고 서로 다른 의견을 연결하며 팀의 생각을 정리",
    studyRole: "질문하기 · 의견 연결 · 생각 조율",
    caution: "팀원 모두가 신중하면 진행 속도가 느려질 수 있음",
    asMate: "질문하고 의견을 들으며 함께 방향을 조율하는 친구",
  },
  fast_adapter: {
    when: { exploration: "low", reflection: "low", relationship: "low" },
    name: "빠른 적응가",
    description: "다른 사람의 설명이나 예시로 방향을 잡고, 이해한 내용을 빠르게 적용해보는 편. 실제 작업은 혼자 집중해서 처리하는 것을 편하게 느낄 수 있음.",
    strength: "새로 얻은 정보를 실제 문제에 빠르게 적용",
    studyRole: "설명 적용 · 문제 실행 · 실전 해결",
    caution: "다음 단계로 넘어가기 전에 풀이 과정이나 판단을 한 번 확인하면 좋음",
    asMate: "좋은 힌트를 얻으면 빠르게 적용해보는 친구",
  },
  energy_learning_mate: {
    when: { exploration: "low", reflection: "low", relationship: "high" },
    name: "에너지 러닝메이트",
    description: "친구와 의견을 나누고 피드백을 주고받으며 방향을 잡고, 아이디어가 나오면 빠르게 실행해보는 것을 편하게 느끼는 편.",
    strength: "대화를 시작하고 질문을 던지며 팀 활동을 실제 행동으로 연결",
    studyRole: "대화 시작 · 질문 던지기 · 실행 촉진",
    caution: "빠르게 움직이는 만큼 중요한 내용을 충분히 검토했는지 확인 필요",
    asMate: "생각을 적극적으로 말하고 빠르게 행동으로 옮기는 친구",
  },
};

// 결과 화면용 재미 추천 (실제 매칭과 무관)
const BEST_MATE_MAP: Record<string, string> = {
  careful_explorer: "fast_adapter",
  fast_adapter: "careful_explorer",
  strategic_collaborator: "energy_learning_mate",
  energy_learning_mate: "strategic_collaborator",
  self_directed_executor: "feedback_designer",
  feedback_designer: "self_directed_executor",
  idea_executor: "feedback_coordinator",
  feedback_coordinator: "idea_executor",
};

const AXES = {
  exploration: { title: "탐색 방식", low: "피드백 활용", high: "자기탐색" },
  reflection: { title: "문제 접근", low: "빠른 실행", high: "숙고" },
  relationship: { title: "학습 관계", low: "개인집중", high: "협력학습" },
} as const;

const REPORT_FIELDS = ["summary", "studyTraits", "strengths", "caution", "studyRole", "mateRecommendation"] as const;

// 결과 문구에 나오면 안 되는 단정·과장 표현 (script.js 의 AI_BLOCKED_PATTERNS 와 같은 규칙)
const BLOCKED_PATTERNS = [
  /성적\S*\s*(향상|오르|올라|높아|높은|좋아)/, /공부를\s*잘/, /최적화/, /확실한/, /딱\s*맞는/,
  /지능|아이큐|\bIQ\b/i, /진로/, /소름/, /진짜\s*공부\s*성격/, /궁합\s*확률/, /완벽한/, /보장/,
];

const SYSTEM_PROMPT = `당신은 고등학교 축제 'STUDY MATE' 부스의 교육용 학습 스타일 리포트 작성자입니다.
학생이 이미 계산된 STUDY STYLE 결과를 바탕으로 자신의 공부 경향을 돌아볼 수 있도록 짧고 따뜻한 설명을 씁니다.

반드시 지킬 원칙:
1. 이 결과는 전문 심리검사·성격검사·진단 결과가 아닙니다. 그렇게 보이는 표현을 쓰지 마세요.
2. 유형과 점수는 이미 정해져 있습니다. 유형을 바꾸거나 새로 판단하지 말고, 주어진 정보만 설명하세요.
3. 단정하지 마세요. "당신은 확실한 ○○형입니다", "당신의 진짜 공부 성격" 같은 표현 금지.
   "현재 응답에서는 ~하는 경향이 상대적으로 높게 나타났어요", "~하는 편이에요", "~할 수 있어요" 처럼 유연하게 쓰세요.
4. 학업능력·지능·성적·진로를 예측하거나 언급하지 마세요. ("성적이 오른다", "공부를 잘한다" 금지)
5. 어떤 유형이 더 우월하거나 열등하다는 표현을 쓰지 마세요. 모든 방식에는 장점과 신경 쓸 점이 함께 있습니다.
6. "최적화된 학습법", "딱 맞는 공부법", "이 방법으로 공부하면 성적이 향상" 같은 효과 보장 표현 금지.
7. 추천 STUDY MATE 는 재미로 보는 제안입니다. "완벽한 상대", "좋은 궁합 보장" 같은 단정·보장 표현 금지.
8. 균형(balanced) 축은 강한 특징처럼 쓰지 말고, 상황에 따라 두 방식을 함께 쓰는 편이라고 설명하세요.
9. 고등학생에게 말하듯 친근한 존댓말(~해요)로, 각 항목 1~3문장, 항목당 200자 이내로 쓰세요.
10. 이름·학교·개인 정보를 추측하거나 지어내지 마세요.

출력은 아래 키만 가진 JSON 객체 하나로만 답하세요. (설명 문장, 코드블록 금지)
{"summary": "...", "studyTraits": "...", "strengths": "...", "caution": "...", "studyRole": "...", "mateRecommendation": "..."}
- summary: 현재 응답에서 나타난 전체 경향 요약
- studyTraits: 공부할 때의 특징 (균형 축이 있으면 함께 언급)
- strengths: 잘 활용할 수 있는 강점
- caution: 한 번쯤 신경 써볼 부분 (부정적 평가가 아닌 제안으로)
- studyRole: 스터디에서 해볼 만한 역할
- mateRecommendation: 추천 STUDY MATE 와 함께할 때 경험해볼 수 있는 점 (보장 표현 없이)`;

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------
const rateBuckets = new Map<string, number[]>();

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = buildCorsHeaders(req);
  if (!cors) return json({ error: "origin_not_allowed" }, 403, {});
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  if (isRateLimited(clientKey(req))) return json({ error: "rate_limited" }, 429, cors);

  let body: unknown;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).length > REQUEST_MAX_BYTES) return json({ error: "too_large" }, 413, cors);
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const profile = validateProfile(body);
  if (!profile) return json({ error: "invalid_profile" }, 400, cors);

  try {
    const raw = await callAIProvider({ system: SYSTEM_PROMPT, user: buildUserPrompt(profile) });
    const report = parseReport(raw);
    if (!report) return json({ error: "invalid_ai_output" }, 502, cors);
    return json({ report }, 200, cors);
  } catch (error) {
    // 요청 내용(점수 등)은 로그에 남기지 않고 오류 종류만 기록
    console.error("study-profile-report failed:", error instanceof Error ? error.name : "unknown");
    const status = error instanceof ConfigError ? 503 : 502;
    return json({ error: status === 503 ? "ai_not_configured" : "ai_failed" }, status, cors);
  }
});

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** ALLOWED_ORIGINS(쉼표 구분)가 설정되어 있으면 그 Origin 만 허용. 미설정 시 모든 Origin 허용 */
function buildCorsHeaders(req: Request): Record<string, string> | null {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  let allowOrigin = "*";
  if (allowed.length) {
    if (!allowed.includes(origin)) return null;
    allowOrigin = origin;
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || "unknown";
}

/** 인스턴스 메모리 기준의 간단한 요청 제한 (best-effort: 인스턴스가 바뀌면 초기화됨) */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  rateBuckets.set(key, recent);
  if (rateBuckets.size > 5000) {
    for (const [k, list] of rateBuckets) {
      if (!list.some((t) => now - t < RATE_LIMIT.windowMs)) rateBuckets.delete(k);
    }
  }
  return recent.length > RATE_LIMIT.max;
}

// ---------------------------------------------------------------------
// 입력 검증 (허용한 키만 사용, 점수로 유형을 다시 계산해 일치 확인)
// ---------------------------------------------------------------------
type Profile = {
  profileType: string;
  explorationScore: number;
  reflectionScore: number;
  relationshipScore: number;
  challengeStimulus: number;
};

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

function level(score: number): Level {
  return score >= 50 ? "high" : "low";
}

function band(score: number): Band {
  if (score < 45) return "low";
  if (score > 55) return "high";
  return "balanced";
}

function validateProfile(input: unknown): Profile | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (data.profileVersion !== PROFILE_VERSION) return null;
  const { profileType, explorationScore, reflectionScore, relationshipScore, challengeStimulus } = data;
  if (typeof profileType !== "string" || !PROFILE_TYPES[profileType]) return null;
  if (![explorationScore, reflectionScore, relationshipScore, challengeStimulus].every(isScore)) return null;

  const expected = Object.entries(PROFILE_TYPES).find(([, t]) =>
    t.when.exploration === level(explorationScore as number)
    && t.when.reflection === level(reflectionScore as number)
    && t.when.relationship === level(relationshipScore as number)
  );
  if (!expected || expected[0] !== profileType) return null;

  return {
    profileType,
    explorationScore: explorationScore as number,
    reflectionScore: reflectionScore as number,
    relationshipScore: relationshipScore as number,
    challengeStimulus: challengeStimulus as number,
  };
}

function buildUserPrompt(profile: Profile): string {
  const type = PROFILE_TYPES[profile.profileType];
  const mate = PROFILE_TYPES[BEST_MATE_MAP[profile.profileType]];
  const axis = (key: keyof typeof AXES, score: number) => ({
    title: AXES[key].title,
    scale: `0 = ${AXES[key].low}, 100 = ${AXES[key].high}`,
    score,
    status: band(score),
  });
  const data = {
    studyStyle: {
      name: type.name,
      baseDescription: type.description,
      strength: type.strength,
      studyRole: type.studyRole,
      caution: type.caution,
    },
    axes: [
      axis("exploration", profile.explorationScore),
      axis("reflection", profile.reflectionScore),
      axis("relationship", profile.relationshipScore),
    ],
    extra: {
      title: "도전 자극도 (다른 사람의 결과나 목표가 공부 자극이 되는 정도, 유형 판정에는 미사용)",
      score: profile.challengeStimulus,
      status: band(profile.challengeStimulus),
    },
    recommendedMate: { name: mate.name, description: mate.asMate },
  };
  return `아래 STUDY STYLE 결과를 원칙에 맞게 설명해주세요. status 는 low / balanced(45~55, 균형) / high 입니다.\n${JSON.stringify(data)}`;
}

// ---------------------------------------------------------------------
// AI 호출 (공급자 교체는 이 함수만 수정)
// ---------------------------------------------------------------------
class ConfigError extends Error {
  constructor() {
    super("AI provider is not configured");
    this.name = "ConfigError";
  }
}

async function callAIProvider(payload: { system: string; user: string }): Promise<string> {
  const provider = (Deno.env.get("AI_PROVIDER") || "openai").toLowerCase();
  const apiKey = Deno.env.get("AI_API_KEY");
  const model = Deno.env.get("AI_MODEL");
  const maxTokens = Number(Deno.env.get("AI_MAX_TOKENS")) || 1200;
  if (!apiKey || !model) throw new ConfigError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: payload.system,
          messages: [{ role: "user", content: payload.user }],
        }),
      });
      if (!res.ok) throw new Error(`provider_${res.status}`);
      const data = await res.json();
      return String(data?.content?.find?.((c: { type: string }) => c.type === "text")?.text ?? "");
    }

    if (provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: payload.system }] },
          contents: [{ role: "user", parts: [{ text: payload.user }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
        }),
      });
      if (!res.ok) throw new Error(`provider_${res.status}`);
      const data = await res.json();
      return String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
    }

    // 기본: OpenAI (또는 AI_BASE_URL 로 지정한 OpenAI 호환 API)
    const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: payload.system },
          { role: "user", content: payload.user },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw new Error(`provider_${res.status}`);
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

/** AI 응답 → 6개 항목 검사 (하나라도 문제가 있으면 null → 브라우저가 기본 설명 사용) */
function parseReport(raw: string): Record<string, string> | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const report: Record<string, string> = {};
  for (const field of REPORT_FIELDS) {
    const value = (data as Record<string, unknown>)[field];
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!text || text.length > FIELD_MAX_LENGTH) return null;
    if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) return null;
    report[field] = text;
  }
  return report;
}
