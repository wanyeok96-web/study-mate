"use strict";

/* =====================================================================
   STUDY MATE - script.js
   ---------------------------------------------------------------------
   ★ 운영진이 주로 수정할 곳 (파일 맨 위에 모아두었습니다)
     1. CONFIG            : 행사 날짜/장소/정원/타임/선택지 등 운영 설정
     2. QUESTIONS         : 최종 16문항 (v1.0)
     3. PROFILE_TYPES     : 8개 STUDY STYLE 이름·설명 + BEST_MATE_MAP
     4. SCORING_RULES     : 3개 핵심 축 + 도전 자극도 계산 규칙, 축 설명 문구
     5. MATCHING_WEIGHTS  : STUDY MATCH 추천 점수 가중치 + 추천 이유 문구
     6. Supabase / AI 설정 : 서버 연결 정보 (anon key 만! service_role 절대 금지)

   ★ 교육적 전제
     STUDY MATE 테스트는 전문 심리검사·성격검사·진단도구·학업능력 검사가 아닙니다.
     학생이 자신의 공부 경향을 돌아보는 축제용 교육 체험이며, 유형 이름은 교육심리학의
     공식 분류명이 아닌 STUDY MATE 캐릭터명입니다. 결과 문구는 단정하지 않습니다.

   ★ 프로그램 동작 영역 (보통은 수정할 필요 없음)
     7. UI 상태 관리 / 화면 전환
     8. 테스트(설문) 처리
     9. 결과 계산
     10. AI 개인화 리포트
     11. 결과 카드 생성 (PNG 저장)
     12. 참가 신청
     13. 확인코드
     14. 결과 조회
     15. 매칭 알고리즘 (HARD FILTER / STUDY MATCH 점수 / 추천 조합 / 매칭 어려운 참가자)
     16. 관리자 (인증, 대시보드, 타임라인, 추천·수동 매칭, 상태 관리, 자동 갱신)
     17. 행사 종료 데이터 삭제 (2단계 확인)
     18. 데이터 서비스 (MOCK / Supabase) + 개발용 도구
     19. Utility 함수
     20. 시작(초기화)

   ★ 보안 원칙
     - service_role key, AI API Key, 관리자 비밀번호를 이 파일에 절대 넣지 않습니다.
     - 개인정보(이름/학번/전화번호)는 localStorage/sessionStorage 에 저장하지 않습니다.
     - 개인정보가 포함된 console.log 를 사용하지 않습니다.
   ===================================================================== */


/* =====================================================================
   1. CONFIG - 운영 설정
   ---------------------------------------------------------------------
   행사 정보나 정원이 바뀌면 여기만 수정하면 됩니다.
   ===================================================================== */
const CONFIG = {
  appName: "STUDY MATE",
  organizer: "프리티처 동아리",
  organizerEn: "PRE-TEACHER",

  // 행사 날짜 / 장소
  eventDate: "2026-10-23",           // YYYY-MM-DD
  eventDateLabel: "2026.10.23 (금)",  // 화면 표시용
  venue: "2-1 교실",

  // 테스트 운영 시간
  testStart: "09:00",
  testEnd: "12:00",

  // STUDY MATE(실제 매칭) 운영 시간
  matchingStart: "09:15",
  matchingEnd: "12:00",

  // 최대 신청 인원 (선착순). MOCK 모드에서만 이 값을 사용합니다.
  // ※ Supabase 모드의 실제 정원은 DB(study_mate_settings.max_participants)가 기준이며
  //   관리자 화면에서 변경합니다. 이 값을 바꿔도 서버 정원은 우회되지 않습니다.
  maxParticipants: 44,

  // 그룹 인원 (운영진 판단으로 2~4명, 권장 3~4명)
  minGroupSize: 2,
  recommendedGroupSize: 3,
  maxGroupSize: 4,

  // 15분 단위 타임 (한 타임당 그룹 1개)
  timeSlots: [
    { id: "A", start: "09:15", end: "09:30" },
    { id: "B", start: "09:30", end: "09:45" },
    { id: "C", start: "09:45", end: "10:00" },
    { id: "D", start: "10:00", end: "10:15" },
    { id: "E", start: "10:15", end: "10:30" },
    { id: "F", start: "10:30", end: "10:45" },
    { id: "G", start: "10:45", end: "11:00" },
    { id: "H", start: "11:00", end: "11:15" },
    { id: "I", start: "11:15", end: "11:30" },
    { id: "J", start: "11:30", end: "11:45" },
    { id: "K", start: "11:45", end: "12:00" },
  ],

  // STUDY MATE 신청 받기 ON/OFF (false 로 바꾸면 신청 버튼을 눌러도 마감 화면이 나옵니다)
  // ※ Supabase 모드에서는 관리자 화면의 [신청 받기] 토글(DB applications_open)이 기준입니다.
  //   여기서 false 로 두면 서버가 열려 있어도 화면에서 추가로 막을 뿐, 서버 마감을 풀 수는 없습니다.
  studyMateApplicationEnabled: true,

  // true: 행사 당일 + 운영시간에만 신청 가능 / false: 언제든 신청 가능 (개발·리허설용)
  enforceEventSchedule: false,

  // 데이터 저장 방식
  //  "mock"     : 서버 없이 브라우저 메모리에서만 동작 (새로고침하면 데이터가 사라짐, 개발/테스트용)
  //  "supabase" : Supabase 에 저장 (SUPABASE_CONFIG 의 url/anonKey/adminEmail 을 채워야 함)
  //               설정이 비어 있으면 자동으로 MOCK 모드로 실행됩니다.
  dataMode: "mock",

  // 화면 상단 '개발 모드' 안내 띠 표시 여부 (실제 운영 시 false)
  showDevBanner: true,

  // 설문·계산 방식 버전. 문항이나 계산식을 바꾸면 올리고, supabase/setup.sql 의 허용 버전도 함께 바꾸세요.
  studyProfileVersion: "1.0",

  // ---------- 신청폼 선택지 (value 는 저장값, label 은 화면 표시) ----------
  genderOptions: [
    { value: "male", label: "남학생" },
    { value: "female", label: "여학생" },
  ],
  // 학년은 학번에서 계산하지 않고 학생이 직접 선택합니다.
  gradeOptions: [
    { value: "1", label: "1학년" },
    { value: "2", label: "2학년" },
    { value: "3", label: "3학년" },
  ],
  preferredGenderOptions: [
    { value: "same", label: "동성이 좋아요" },
    { value: "opposite", label: "이성이 좋아요" },
    { value: "any", label: "상관없어요" },
  ],
  preferredGradeOptions: [
    { value: "same", label: "같은 학년이 좋아요" },
    { value: "different", label: "다른 학년과 만나보고 싶어요" },
    { value: "any", label: "상관없어요" },
  ],

  // 학번 입력 규칙 (학교 학번 형식에 맞게 수정)
  studentNumberRule: {
    pattern: /^[0-9]{4,6}$/,
    hint: "숫자 4~6자리로 입력해주세요. (예: 20315)",
  },

  // 확인코드 형식: SM-XXXXXX (헷갈리는 글자 0/O, 1/I/L 제외, 31^6 ≈ 8.9억 가지)
  // ※ 길이를 바꾸면 supabase/setup.sql 의 CHECK 제약·코드 생성·조회 함수도 함께 바꿔야 합니다.
  confirmationCode: {
    prefix: "SM-",
    length: 6,
    alphabet: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  },

  privacyDeleteNotice: "🔒 입력한 개인정보는 행사 운영 및 긴급 연락 목적으로만 사용하며, 행사 종료 후 삭제합니다.",

  // 분석 중 연출 시간(ms)
  analyzingDurationMs: 2600,

  // 관리자 암호 오입력 제한 (화면 잠금. Supabase Auth 자체의 요청 제한과 별개)
  adminMaxAttempts: 5,
  adminLockSeconds: 30,

  // 관리자 대시보드 자동 새로고침 간격(초). 모달이 열려 있거나 작업 중이면 건너뜁니다.
  adminAutoRefreshSeconds: 15,

  // ---------- 추천 매칭 운영 설정 (점수 계산 자체는 MATCHING_WEIGHTS) ----------
  matching: {
    // 그룹 인원 선호 (추천 '순위'에만 더해지는 보너스. STUDY MATCH 점수에는 더하지 않음). 3명 → 4명 → 2명 순
    groupSizePreference: { 3: 3, 4: 2, 2: -6 },

    // 추천 조합 카드 최대 개수 (5~10 권장)
    topRecommendations: 8,

    // 추천 이유 최대 개수 (희망 조건 충족 문장 포함)
    maxReasons: 4,
  },
};


/* =====================================================================
   2. QUESTIONS - 설문 문항 (최종 16문항 · v1.0)
   ---------------------------------------------------------------------
   문항 문구를 고칠 때는 text / options[].text 만 바꾸면 됩니다.
   점수 계산은 아래 scale / direction / options[].value 설정을 그대로 읽어서 합니다.

   각 항목 설명
   - id        : 문항 고유 번호 (중복 금지)
   - theory    : 참고 이론 (화면에는 표시하지 않음)
                 "field_dependence"        장의존–장독립
                 "reflection_impulsivity"  숙고–충동(빠른 실행)
                 "grasha_riechmann"        Grasha–Riechmann 학습양식
   - format    : "ab"(A/B 선택) 또는 "likert"(5점 척도)
   - scale     : 점수가 모이는 곳 (SCORING_RULES.itemScales 의 키)
                 exploration / reflection / independent / collaborative / challenge
   - direction : likert 전용. 1 = 그대로, -1 = 역산(100 - 점수)
   - options   : ab 전용. value 0 = 피드백 활용 방향, 100 = 자기탐색 방향
   ===================================================================== */
const QUESTIONS = [
  // ---- A. 장의존–장독립: A = 다른 사람의 설명·피드백·맥락 활용(0) / B = 스스로 탐색·분석·구조화(100) ----
  { id: 1, theory: "field_dependence", format: "ab", scale: "exploration",
    text: "공부하다가 이해되지 않는 부분이 생겼을 때 나는?",
    options: [
      { key: "A", text: "친구나 선생님에게 설명을 부탁하며 이해해본다.", value: 0 },
      { key: "B", text: "책이나 자료를 찾아보며 스스로 이해해본다.", value: 100 },
    ] },
  { id: 2, theory: "field_dependence", format: "ab", scale: "exploration",
    text: "틀린 문제를 다시 정리할 때 나는?",
    options: [
      { key: "A", text: "친구나 선생님과 틀린 이유를 이야기하며 정리한다.", value: 0 },
      { key: "B", text: "혼자 틀린 이유를 분석하고 정리한다.", value: 100 },
    ] },
  { id: 3, theory: "field_dependence", format: "ab", scale: "exploration",
    text: "새로운 단원을 처음 공부할 때 나는?",
    options: [
      { key: "A", text: "선생님의 설명을 듣고 궁금한 점을 질문하며 이해한다.", value: 0 },
      { key: "B", text: "교과서나 자료를 살펴보며 내 방식으로 내용을 정리한다.", value: 100 },
    ] },
  { id: 4, theory: "field_dependence", format: "ab", scale: "exploration",
    text: "발표나 수행평가를 준비할 때 나는?",
    options: [
      { key: "A", text: "다른 사람의 의견이나 피드백을 참고하며 내용을 구성한다.", value: 0 },
      { key: "B", text: "필요한 자료를 직접 찾아 분석하며 내용을 구성한다.", value: 100 },
    ] },

  // ---- B. 숙고–빠른 실행: direction 1 = 숙고 방향, -1 = 빠른 실행 방향(숙고 점수에서 역산) ----
  { id: 5, theory: "reflection_impulsivity", format: "likert", scale: "reflection", direction: 1,
    text: "답을 선택하기 전에 여러 가능성을 생각해 보는 편이다." },
  { id: 6, theory: "reflection_impulsivity", format: "likert", scale: "reflection", direction: -1,
    text: "모르는 문제가 나오면 충분히 고민하기보다 일단 가능한 해결 방법부터 시도해보는 편이다." },
  { id: 7, theory: "reflection_impulsivity", format: "likert", scale: "reflection", direction: 1,
    text: "시험 문제를 다 푼 후에는 제출하기 전에 답이나 풀이 과정을 한 번 더 확인하는 편이다." },
  { id: 8, theory: "reflection_impulsivity", format: "likert", scale: "reflection", direction: -1,
    text: "시험에서 답을 정하면 오래 고민하기보다 다음 문제로 빠르게 넘어가는 편이다." },

  // ---- C. Grasha–Riechmann: 독립 / 협력 / 도전 자극 ----
  { id: 9, theory: "grasha_riechmann", format: "likert", scale: "independent", direction: 1,
    text: "시험공부를 할 때 내가 세운 계획에 따라 공부하는 편이다." },
  { id: 10, theory: "grasha_riechmann", format: "likert", scale: "independent", direction: 1,
    text: "새로운 단원을 공부할 때 먼저 내용을 혼자 살펴보고 내가 이해한 방식으로 정리하는 편이다." },
  { id: 11, theory: "grasha_riechmann", format: "likert", scale: "collaborative", direction: 1,
    text: "어려운 문제가 나오면 다른 사람과 이야기하며 해결 방법을 찾아보는 편이다." },
  { id: 12, theory: "grasha_riechmann", format: "likert", scale: "collaborative", direction: 1,
    text: "친구에게 내가 이해한 내용을 설명하면서 공부하면 학습 내용이 더 잘 정리되는 편이다." },
  { id: 13, theory: "grasha_riechmann", format: "likert", scale: "collaborative", direction: 1,
    text: "친구와 함께 공부하면 혼자 공부할 때보다 집중이 더 잘 되는 편이다." },
  // Q14 는 대표 STUDY STYLE 판정에 쓰지 않고 '도전 자극도(challengeStimulus)'로만 사용
  { id: 14, theory: "grasha_riechmann", format: "likert", scale: "challenge", direction: 1,
    text: "친구와 공부 결과를 비교하면 공부를 더 열심히 해야겠다는 자극을 받는 편이다." },
  { id: 15, theory: "grasha_riechmann", format: "likert", scale: "collaborative", direction: 1,
    text: "친구와 생각이 다를 때 서로의 의견을 비교하고 이야기해보는 것을 좋아하는 편이다." },
  { id: 16, theory: "grasha_riechmann", format: "likert", scale: "collaborative", direction: 1,
    text: "친구와 함께 공부할 때 각자 잘하는 역할을 나누어 공부하는 방식이 효과적이라고 생각한다." },
];

// 5점 Likert 선택지 (화면 표시용 문구)
const LIKERT_OPTIONS = [
  { value: 1, label: "전혀 그렇지 않다" },
  { value: 2, label: "그렇지 않은 편이다" },
  { value: 3, label: "보통이다" },
  { value: 4, label: "그런 편이다" },
  { value: 5, label: "매우 그렇다" },
];


/* =====================================================================
   3. PROFILE_TYPES - 8개 STUDY STYLE (축제용 캐릭터명, 교육심리학 공식 분류명 아님)
   ---------------------------------------------------------------------
   세 핵심 축(탐색 방식 / 문제 접근 / 학습 관계)이 각각 50 이상("high")인지 50 미만("low")인지로
   2×2×2 = 8개 유형을 정합니다. (when 의 조합은 서로 겹치지 않아야 합니다)
     exploration  high = 자기탐색   / low = 피드백 활용
     reflection   high = 숙고       / low = 빠른 실행
     relationship high = 협력학습   / low = 개인집중
   ※ supabase/setup.sql 의 sm_profile_type() 도 같은 규칙으로 유형을 다시 계산해 검증합니다.

   - asMate : 이 유형이 '추천 STUDY MATE'로 소개될 때 쓰는 표현 (결과 화면 💘 영역)
   ===================================================================== */
const PROFILE_TYPES = [
  {
    id: "careful_explorer",
    when: { exploration: "high", reflection: "high", relationship: "low" },
    name: "신중한 탐구가",
    emoji: "🔎",
    tagline: "충분히 이해하고 나서 움직이는 깊이파.",
    description: "새로운 내용을 접하면 다른 사람에게 바로 묻기보다 먼저 직접 살펴보고 자신의 방식으로 정리하는 편이에요. 답을 내기 전에도 한 번 더 검토하는 경향이 있고, 혼자 집중할 수 있는 시간을 중요하게 느낄 수 있어요.",
    strength: "자료를 분석하고 핵심을 정리하거나 놓친 부분을 확인하는 과정에서 강점을 보일 수 있어요.",
    studyRole: "자료 정리 · 오류 발견 · 핵심 개념 정리",
    caution: "충분히 생각하는 과정이 길어지면 시작이나 실행이 늦어질 수 있어요.",
    asMate: "먼저 직접 살펴보고 한 번 더 꼼꼼히 확인하는 친구",
  },
  {
    id: "strategic_collaborator",
    when: { exploration: "high", reflection: "high", relationship: "high" },
    name: "전략적 협력가",
    emoji: "🧩",
    tagline: "내 생각을 만든 뒤, 함께 더 좋은 답을 찾는 타입.",
    description: "먼저 스스로 내용을 분석하고 생각을 정리한 뒤 친구들과 의견을 나누며 이해를 깊게 하는 편이에요. 빠르게 결론을 내기보다 충분히 생각하고 함께 검토하는 과정에서 편안함을 느낄 수 있어요.",
    strength: "자신의 생각과 다른 사람의 의견을 연결하고 정리하는 과정에서 강점을 보일 수 있어요.",
    studyRole: "계획 세우기 · 의견 정리 · 팀 방향 잡기",
    caution: "팀원 모두가 충분히 생각한 뒤 움직이려 하면 실제 실행이 늦어질 수도 있어요.",
    asMate: "충분히 생각을 정리한 뒤 함께 의견을 맞춰가는 친구",
  },
  {
    id: "self_directed_executor",
    when: { exploration: "high", reflection: "low", relationship: "low" },
    name: "자기주도 실행가",
    emoji: "🚀",
    tagline: "내가 판단하고, 일단 해보면서 답을 찾는 타입.",
    description: "스스로 필요한 정보를 찾고 방향을 정하는 것을 선호하면서, 생각이 어느 정도 정리되면 빠르게 행동으로 옮기는 편이에요.",
    strength: "과제를 시작하거나 새로운 방법을 실제로 시도하는 과정에서 추진력을 보일 수 있어요.",
    studyRole: "문제 시작 · 과제 진행 · 새로운 방법 시도",
    caution: "빠르게 진행하다 보면 놓친 부분이 없는지 확인하는 과정이 필요할 수 있어요.",
    asMate: "스스로 방향을 정하고 일단 시작해보는 친구",
  },
  {
    id: "idea_executor",
    when: { exploration: "high", reflection: "low", relationship: "high" },
    name: "아이디어 실행가",
    emoji: "💡",
    tagline: "내 아이디어를 팀과 함께 바로 현실로 만드는 타입.",
    description: "스스로 해결 방법이나 아이디어를 찾아보는 것을 좋아하면서도 다른 사람과 함께 공부하는 과정에도 적극적인 편이에요. 생각을 실제 활동으로 옮기면서 발전시키는 경향이 나타날 수 있어요.",
    strength: "아이디어를 제안하고 팀이 실제 활동을 시작하도록 만드는 과정에서 강점을 보일 수 있어요.",
    studyRole: "아이디어 제안 · 활동 시작 · 팀 분위기 활성화",
    caution: "빠르게 움직이는 만큼 세부적인 내용을 다시 확인하는 시간을 가져보는 것도 좋아요.",
    asMate: "아이디어를 내고 팀과 함께 바로 움직여보는 친구",
  },
  {
    id: "feedback_designer",
    when: { exploration: "low", reflection: "high", relationship: "low" },
    name: "피드백 설계가",
    emoji: "📚",
    tagline: "좋은 설명을 받아들이고, 내 방식으로 다시 정리하는 타입.",
    description: "선생님이나 친구의 설명과 피드백을 학습에 활용하면서, 최종적으로는 혼자 내용을 정리하고 충분히 생각하는 시간을 편하게 느끼는 편이에요.",
    strength: "설명이나 자료에서 핵심을 찾고 자신의 방식으로 다시 구조화하는 데 강점을 보일 수 있어요.",
    studyRole: "설명 정리 · 핵심 구조화 · 최종 검토",
    caution: "충분한 정보를 얻은 뒤 시작하려다 보면 행동으로 옮기는 시점이 늦어질 수 있어요.",
    asMate: "설명을 잘 듣고 차분하게 내용을 정리하는 친구",
  },
  {
    id: "feedback_coordinator",
    when: { exploration: "low", reflection: "high", relationship: "high" },
    name: "피드백 조율가",
    emoji: "🤝",
    tagline: "이야기를 듣고, 생각하고, 함께 가장 좋은 방향을 찾는 타입.",
    description: "다른 사람의 설명이나 의견을 적극적으로 활용하고 함께 이야기하면서 내용을 이해하는 것을 선호하는 편이에요. 동시에 바로 결론을 내리기보다 충분히 검토하려는 경향도 나타날 수 있어요.",
    strength: "질문하고 서로 다른 의견을 연결하며 팀의 생각을 정리하는 과정에서 강점을 보일 수 있어요.",
    studyRole: "질문하기 · 의견 연결 · 생각 조율",
    caution: "팀원 모두가 신중하게 생각하는 편이라면 진행 속도가 느려질 수도 있어요.",
    asMate: "질문하고 의견을 들으며 함께 방향을 조율하는 친구",
  },
  {
    id: "fast_adapter",
    when: { exploration: "low", reflection: "low", relationship: "low" },
    name: "빠른 적응가",
    emoji: "⚡",
    tagline: "좋은 힌트를 얻으면 빠르게 내 것으로 만드는 타입.",
    description: "다른 사람의 설명이나 예시를 활용해 방향을 잡고, 이해한 내용을 빠르게 적용해보는 편이에요. 실제 작업에서는 혼자 집중해서 처리하는 것을 편하게 느낄 수도 있어요.",
    strength: "새롭게 얻은 정보를 실제 문제에 빠르게 적용하는 과정에서 강점을 보일 수 있어요.",
    studyRole: "설명 적용 · 문제 실행 · 실전 해결",
    caution: "빠르게 다음 단계로 넘어가기 전에 풀이 과정이나 판단을 한 번 확인해보면 좋아요.",
    asMate: "좋은 힌트를 얻으면 빠르게 적용해보는 친구",
  },
  {
    id: "energy_learning_mate",
    when: { exploration: "low", reflection: "low", relationship: "high" },
    name: "에너지 러닝메이트",
    emoji: "💬",
    tagline: "함께 말하고, 함께 시도할 때 에너지가 올라가는 타입.",
    description: "친구와 의견을 나누고 피드백을 주고받으며 학습 방향을 잡고, 아이디어가 나오면 빠르게 실행해보는 것을 편하게 느끼는 편이에요.",
    strength: "대화를 시작하고 질문을 던지며 팀의 활동을 실제 행동으로 연결하는 과정에서 강점을 보일 수 있어요.",
    studyRole: "대화 시작 · 질문 던지기 · 실행 촉진",
    caution: "빠르게 이야기하고 움직이는 만큼 중요한 내용을 충분히 검토했는지 확인하는 과정도 필요해요.",
    asMate: "생각을 적극적으로 말하고 빠르게 행동으로 옮기는 친구",
  },
];

// 저장된 유형 id 가 목록에 없을 때(예전 데이터 등) 화면이 깨지지 않도록 쓰는 표시용 값
const UNKNOWN_PROFILE = {
  id: "unknown",
  name: "STUDY STYLE 확인 필요",
  emoji: "❔",
  tagline: "",
  description: "",
  strength: "",
  studyRole: "",
  caution: "",
  asMate: "",
};

/* BEST MATE 관계 (결과 화면의 재미 추천 전용)
   ⚠️ 실제 참가자 매칭(STUDY MATCH)에는 사용하지 않습니다.
      실제 매칭은 MATCHING_WEIGHTS 에 따라 세 축의 원점수(0~100)만으로 계산합니다. */
const BEST_MATE_MAP = {
  careful_explorer: "fast_adapter",
  fast_adapter: "careful_explorer",
  strategic_collaborator: "energy_learning_mate",
  energy_learning_mate: "strategic_collaborator",
  self_directed_executor: "feedback_designer",
  feedback_designer: "self_directed_executor",
  idea_executor: "feedback_coordinator",
  feedback_coordinator: "idea_executor",
};


/* =====================================================================
   4. SCORING_RULES - 점수 계산 규칙 (v1.0)
   ---------------------------------------------------------------------
   [핵심 축 3개] 모두 0~100, 정수로 반올림
   ① explorationScore  = Q1~Q4 의 A/B 값 평균 (A = 0, B = 100)
                          0 쪽 = 💬 피드백 활용 / 100 쪽 = 🔎 자기탐색
   ② reflectionScore   = Q5, Q7 (Likert 점수 그대로) + Q6, Q8 (100 - Likert 점수) 의 평균
                          0 쪽 = 🚀 빠른 실행 / 100 쪽 = 🧠 숙고
   ③ relationshipScore = 50 + (협력 평균[Q11·12·13·15·16] - 독립 평균[Q9·10]) / 2  → 0~100 으로 제한
                          0 쪽 = 🎧 개인집중 / 100 쪽 = 🤝 협력학습
   [추가 점수] challengeStimulus = Q14 의 Likert 점수 (유형 판정에는 사용하지 않음)

   Likert 응답 → 점수: 1 → 0, 2 → 25, 3 → 50, 4 → 75, 5 → 100

   [구간]
   - 유형 판정: 반올림한 점수가 typeThreshold(50) 이상이면 high, 미만이면 low
   - 결과 설명: 0~44 low 방향 / 45~55 균형 / 56~100 high 방향
     → 45~55 인 축은 유형 설명이 있더라도 '균형' 문구로 안내합니다.
   ===================================================================== */
const SCORING_RULES = {
  version: CONFIG.studyProfileVersion,

  likertToScore: { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 },

  // 문항 scale 목록 (QUESTIONS[].scale 은 이 중 하나여야 함)
  itemScales: ["exploration", "reflection", "independent", "collaborative", "challenge"],

  typeThreshold: 50,
  balanceRange: { min: 45, max: 55 },

  // 학생 화면 표시용 이름과 축 설명 (내부 변수명과 분리)
  axes: {
    exploration: {
      title: "탐색 방식",
      low: { emoji: "💬", label: "피드백 활용" },
      high: { emoji: "🔎", label: "자기탐색" },
      descriptions: {
        low: "현재 응답에서는 다른 사람의 설명이나 피드백을 활용해 이해하는 경향이 상대적으로 높게 나타났어요.",
        balanced: "스스로 탐색하는 방식과 다른 사람의 설명을 활용하는 방식을 비교적 균형 있게 사용하는 편이에요.",
        high: "현재 응답에서는 자료를 직접 찾아보고 스스로 정리하는 경향이 상대적으로 높게 나타났어요.",
      },
    },
    reflection: {
      title: "문제 접근",
      low: { emoji: "🚀", label: "빠른 실행" },
      high: { emoji: "🧠", label: "숙고" },
      descriptions: {
        low: "현재 응답에서는 일단 시도해보면서 답을 찾아가는 경향이 상대적으로 높게 나타났어요.",
        balanced: "충분히 검토하는 방식과 빠르게 시도해보는 방식을 상황에 따라 비교적 균형 있게 사용하는 편이에요.",
        high: "현재 응답에서는 답을 정하기 전에 여러 가능성을 살피고 다시 확인하는 경향이 상대적으로 높게 나타났어요.",
      },
    },
    relationship: {
      title: "학습 관계",
      low: { emoji: "🎧", label: "개인집중" },
      high: { emoji: "🤝", label: "협력학습" },
      descriptions: {
        low: "현재 응답에서는 혼자 집중해서 공부하는 방식이 상대적으로 편하게 느껴지는 경향이 나타났어요.",
        balanced: "혼자 집중하는 공부와 친구와 함께하는 공부를 비교적 균형 있게 활용하는 편이에요.",
        high: "현재 응답에서는 친구와 이야기하며 함께 공부하는 방식이 상대적으로 편하게 느껴지는 경향이 나타났어요.",
      },
    },
  },

  challenge: {
    emoji: "🔥",
    title: "도전 자극도",
    descriptions: {
      low: "다른 사람과 비교하기보다 자신의 목표와 속도에 집중하는 편이에요.",
      balanced: "상황에 따라 경쟁이나 비교를 자극으로 활용하기도 하고, 자신의 속도에 집중하기도 해요.",
      high: "다른 사람의 결과나 목표가 공부를 시작하거나 이어가는 자극으로 작용하는 편이에요.",
    },
  },
};

// 세 핵심 축의 키 (화면·카드·매칭에서 같은 순서로 사용)
const AXIS_KEYS = ["exploration", "reflection", "relationship"];


/* =====================================================================
   5. MATCHING_WEIGHTS - STUDY MATCH 추천 점수
   ---------------------------------------------------------------------
   "함께 공부하는 방식은 비슷하게, 정보 탐색·문제 접근은 적당히 다르게"
   - similarity : 두 학생 점수가 비슷할수록 높음 → 100 - |차이|
   - complement : 차이가 targetDifference 일 때 100점, 너무 작거나 너무 크면 감점
                  100 - (| |차이| - target | / max(target, 100 - target)) × 100
   ⚠️ targetDifference(30)와 가중치는 과학적으로 검증된 '궁합값'이 아니라,
      STUDY MATE 운영진이 정한 교육용 추천 규칙입니다. 최종 확정은 항상 운영진이 합니다.
   - 유형 이름(PROFILE_TYPES / BEST_MATE_MAP)은 점수 계산에 쓰지 않습니다. 세 축의 원점수만 사용합니다.
   - challengeStimulus(도전 자극도)는 현재 STUDY MATCH 점수에 포함하지 않습니다.
   - 2인 점수 = Σ(축 점수 × weight) / Σweight → 반올림 (0~100)
   - 그룹 점수 = 모든 2인 조합 점수의 평균 → 반올림
   ===================================================================== */
const MATCHING_WEIGHTS = {
  relationship: {
    mode: "similarity",
    weight: 0.40,
  },

  exploration: {
    mode: "complement",
    weight: 0.30,
    targetDifference: 30,
  },

  reflection: {
    mode: "complement",
    weight: 0.30,
    targetDifference: 30,
  },
};

/* 추천 이유 문장 (유형 이름이 아니라 실제 점수 차이로 고릅니다)
   - similarity 축 : 차이 ≤ nearRange → near / ≤ nearRange×2 → mid / 그 이상 → far
   - complement 축 : |차이 - target| ≤ nearRange → near / 차이가 더 작으면 tooClose / 더 크면 tooFar
   far / tooFar 문장은 '참고' 로 따로 표시합니다. ("좋은 궁합", "완벽한 상대" 같은 단정 표현 금지) */
const MATCH_REASON_RULES = {
  nearRange: 15,
  texts: {
    relationship: {
      near: "함께 공부하는 방식에 대한 선호가 비슷해요.",
      mid: "함께 공부하는 방식에 대한 선호가 크게 다르지 않아요.",
      far: "혼자 공부와 함께 공부에 대한 선호가 달라서, 진행 방식을 미리 정해두면 좋아요.",
    },
    exploration: {
      near: "정보를 찾고 이해하는 방식에서 서로 다른 강점을 활용할 수 있어요.",
      tooClose: "정보를 찾고 이해하는 방식이 비슷해서 서로의 방식을 쉽게 이해할 수 있어요.",
      tooFar: "정보를 찾는 방식의 차이가 큰 편이라, 서로의 방식을 설명해주며 진행하면 좋아요.",
    },
    reflection: {
      near: "문제를 접근하는 속도와 검토 방식에서 적절한 차이가 있어요.",
      tooClose: "문제를 접근하는 속도가 비슷한 편이에요.",
      tooFar: "문제를 접근하는 속도 차이가 큰 편이라, 실행과 검토 역할을 나눠보면 좋아요.",
    },
  },
  hardFilterOk: "모든 구성원의 성별·학년 희망 조건을 만족해요.",
};


/* =====================================================================
   6. Supabase / AI 설정
   ---------------------------------------------------------------------
   ⚠️ 여기에는 anon(public) key 만 넣습니다. service_role key 는 절대 넣지 마세요.
   학생 화면은 테이블을 직접 조회하지 않고, 아래 RPC(서버 함수)만 호출합니다.
   → 다른 참가자의 이름/전화번호/학번/설문결과를 조회할 수 없도록 RLS + 서버 함수로 막습니다.
   (테이블·함수·RLS 는 supabase/setup.sql 을 SQL Editor 에서 실행하면 생성됩니다)

   세 값(url, anonKey, adminEmail)을 채우고 CONFIG.dataMode 를 "supabase" 로 바꾸면 실제 DB 를 사용합니다.
   adminEmail 은 setup.sql STEP 2 에서 등록한 관리자 이메일과 같아야 합니다.
   ===================================================================== */
const SUPABASE_CONFIG = {
  url: "",      // 예: "https://xxxxxxxx.supabase.co"
  anonKey: "",  // Supabase 대시보드 > Project Settings > API > anon public (또는 publishable) key

  // 관리자 로그인용 이메일 (Supabase Auth 에 미리 만들어 둔 관리자 계정, 비밀번호는 여기 넣지 않음)
  adminEmail: "",

  // 관리자 로그인에만 사용하는 공식 Supabase JS 라이브러리 (버전 고정, 관리자 화면에서만 불러옴)
  sdkUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js",

  // 관리자 로그인 세션(토큰)을 보관할 sessionStorage 키 (비밀번호는 저장하지 않음, 탭을 닫으면 사라짐)
  authStorageKey: "study-mate-admin-auth",

  // 서버 함수(RPC) 이름 - supabase/setup.sql 과 같아야 함
  rpc: {
    // 학생용 (anon 실행 가능)
    applicationStatus: "sm_get_application_status", // 신청 가능 여부/인원수만 반환
    submitApplication: "sm_submit_application",     // 신청 저장 + 확인코드 발급 (서버에서 생성)
    lookupByCode: "sm_lookup_match",                // 확인코드로 내 매칭결과만 반환 (상대 정보 없음)
    // 관리자용 (지정된 관리자 계정만 통과)
    isAdmin: "sm_is_admin",
    adminDashboard: "sm_admin_get_dashboard",
    adminContact: "sm_admin_get_participant_contact",
    adminCreateMatch: "sm_admin_create_match",
    adminUpdateStatus: "sm_admin_update_participant_status",
    adminAssignSlot: "sm_admin_assign_time_slot",
    adminDissolveMatch: "sm_admin_dissolve_match",
    adminToggleApplications: "sm_admin_toggle_applications",
    adminSetMaxParticipants: "sm_admin_set_max_participants",
    adminDeleteEventData: "sm_admin_delete_event_data",
  },

  requestTimeoutMs: 10000,
};

// AI 개인화 리포트 - GitHub Pages → Supabase Edge Function(study-profile-report) → AI API
// ⚠️ AI API Key 는 절대 여기에 넣지 않습니다. (Supabase Secret 으로만 관리)
// ⚠️ AI 에는 유형·점수·균형 여부·추천 유형만 보냅니다. (이름/학번/전화/성별/확인코드/팀 정보 전송 금지)
// AI 가 꺼져 있거나 실패/지연되면 PROFILE_TYPES 기본 설명이 즉시 사용되므로 전체 흐름은 AI 와 무관하게 동작합니다.
const AI_CONFIG = {
  enabled: false,  // Edge Function 배포 + AI Secret 설정 후 true
  endpoint: "",    // 비워두면 `${SUPABASE_CONFIG.url}/functions/v1/study-profile-report` 사용
  maxWaitMs: 4500, // 결과 화면을 위해 기다리는 최대 시간 (넘으면 기본 설명 사용)
};


/* =====================================================================
   사용자에게 보여줄 오류 메시지 (기술적인 오류 대신 친절한 한국어)
   ===================================================================== */
const ERROR_MESSAGES = {
  // ---- 공통 / 학생 ----
  NETWORK: "인터넷 연결이 불안정해요. 잠시 후 다시 시도해주세요.",
  TIMEOUT: "응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.",
  SERVER: "일시적인 문제가 발생했어요. 잠시 후 다시 시도해주세요.",
  DUPLICATE: "이미 STUDY MATE에 신청한 학번입니다. 확인코드를 잃어버렸다면 2-1 교실 운영진에게 문의해주세요.",
  FULL: "신청 정원이 마감되었습니다.",
  SLOTS_FULL: "모든 타임이 마감되어 오늘의 STUDY MATE 신청이 종료되었어요 💔",
  APPLICATION_CLOSED: "오늘의 STUDY MATE 신청이 마감되었습니다 💔",
  OUT_OF_SCHEDULE: "STUDY MATE 신청은 축제 당일 운영시간에만 가능해요.",
  INVALID: "입력한 내용을 다시 확인해주세요.",
  NOT_FOUND: "확인코드를 찾을 수 없어요. 코드를 다시 확인해주세요.",
  INVALID_CODE_FORMAT: "확인코드 형식이 올바르지 않아요. (예: SM-K7F2Q8)",
  RATE_LIMITED: "조회 요청이 너무 많아요. 잠시 후 다시 시도해주세요.",
  SAVE_FAILED: "신청을 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해주세요.",
  CARD_FAILED: "결과 카드 이미지를 만들지 못했어요. 대신 화면을 캡처해주세요 📸",
  NO_PROFILE: "먼저 STUDY STYLE TEST를 완료해주세요.",
  NOT_IMPLEMENTED: "아직 준비 중인 기능이에요.",
  UNKNOWN: "알 수 없는 문제가 발생했어요. 잠시 후 다시 시도해주세요.",

  // ---- 관리자 ----
  ADMIN_AUTH_FAILED: "관리자 인증에 실패했습니다. 비밀번호를 확인해주세요.",
  ADMIN_LOCKED: "암호를 여러 번 틀려 잠시 잠겼어요. 잠시 후 다시 시도해주세요.",
  ADMIN_NOT_CONFIGURED: "관리자 로그인이 아직 설정되지 않았어요. (SUPABASE_CONFIG.adminEmail 확인)",
  NOT_ADMIN: "관리자 권한이 없습니다. 다시 로그인해주세요.",
  AUTH_EXPIRED: "로그인이 만료되었습니다. 다시 로그인해주세요.",
  SDK_LOAD_FAILED: "관리자 로그인 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요.",
  DUPLICATE_MEMBER: "같은 학생이 중복으로 선택되었습니다.",
  GROUP_SIZE: "팀 인원이 허용 범위(최소~최대 인원)를 벗어났습니다.",
  SLOT_INVALID: "올바르지 않은 타임입니다.",
  SLOT_TAKEN: "이미 다른 팀이 사용 중인 타임입니다. 다른 타임을 선택해주세요.",
  NO_FREE_SLOT: "남은 소개팅 타임이 없습니다.",
  MEMBER_NOT_FOUND: "삭제되었거나 존재하지 않는 참가자가 포함되어 있습니다. 새로고침 후 다시 확인해주세요.",
  MEMBER_NOT_WAITING: "이미 팀이 정해졌거나 매칭 대기 상태가 아닌 학생이 있습니다. 새로고침 후 다시 확인해주세요.",
  HARD_FILTER: "희망 조건(성별/학년)이 서로 맞지 않는 학생이 있어 확정할 수 없습니다.",
  GROUP_TOO_SMALL: "남은 인원이 너무 적어 팀을 유지할 수 없습니다.",
  STATUS_NEEDS_MATCH: "팀이 없는 참가자는 이 상태로 바꿀 수 없습니다. 먼저 팀을 확정해주세요.",
  INVALID_STATUS: "올바르지 않은 상태 값입니다.",
  MATCH_NOT_FOUND: "팀을 찾을 수 없습니다. 새로고침 후 다시 확인해주세요.",
  MATCH_COMPLETED: "체험을 완료한 학생이 있는 팀은 해체할 수 없습니다.",
  CONFIRM_REQUIRED: "확인 문구 '삭제'를 정확히 입력해주세요.",
  CODE_GENERATION_FAILED: "확인코드를 만들지 못했어요. 잠시 후 다시 시도해주세요.",
};

// 서버(SQL) 오류 코드 중 이름이 다른 것 → 화면용 오류 코드
const SERVER_ERROR_ALIASES = { CLOSED: "APPLICATION_CLOSED" };


/* =====================================================================
   7. UI 상태 관리 / 화면 전환
   ===================================================================== */

// 현재 테스트 세션의 상태 (메모리에만 존재, 새로고침하면 초기화)
const state = {
  currentView: "intro",
  currentQuestionIndex: 0,
  answers: {},             // { 문항id: 응답값 }
  profile: null,           // calculateStudyProfile() 결과
  explanation: null,       // generateAIExplanation() 결과 (메모리에만 보관, 서버 저장 안 함)
  sessionProfileId: null,  // 이번 테스트 결과의 무작위 ID (개인정보 아님)
  consentChecked: false,
  lastConfirmationCode: null,
  isSubmitting: false,
  isAnalyzing: false,
  // 관리자 화면 상태 (메모리에만 존재 / 개인정보는 data 안에만 있고 로그아웃 시 즉시 비움)
  admin: {
    session: null,
    failedAttempts: 0,
    lockedUntil: 0,
    data: null,              // { settings, participants, matches } (fetchAdminParticipants 결과)
    lastLoadedAt: null,
    isLoading: false,
    busy: false,             // 매칭 확정/상태 변경 등 작업 중이면 true (자동 새로고침 건너뜀)
    search: "",
    filter: "all",
    sortDesc: false,
    maskNames: false,
    selected: new Set(),     // 수동 매칭으로 선택한 참가자 id
    recommendations: [],
    recommendationKey: "",
    autoRefreshTimer: null,
  },
};

// 데이터 서비스 (init 에서 MOCK 또는 Supabase 로 결정)
let DataService = null;

// 화면 이름 → 들어갈 수 있는 조건 (뒤로가기 등으로 잘못된 화면에 들어가는 것 방지)
const VIEW_GUARDS = {
  analyzing: () => state.isAnalyzing,
  result: () => !!state.profile,
  end: () => !!state.profile,
  notice: () => !!state.profile,
  closed: () => true,
  form: () => !!state.profile && state.consentChecked,
  complete: () => !!state.lastConfirmationCode,
  admin: () => !!state.admin.session,
};

// 들어갈 수 없는 화면일 때 대신 보여줄 화면
function fallbackViewFor(name) {
  if (name === "form" && state.lastConfirmationCode) return "complete";
  if (name === "analyzing" && state.profile) return "result";
  if (name === "admin") return "adminLogin";
  return state.profile ? "result" : "intro";
}

/** 화면 전환: index.html 의 data-view 이름으로 해당 section 만 보여줌 */
function showView(name, { push = true, focus = true } = {}) {
  const guard = VIEW_GUARDS[name];
  if (guard && !guard()) name = fallbackViewFor(name);

  // 설문 화면은 들어올 때마다 현재 문항을 다시 그림 (뒤로가기로 돌아온 경우 대비)
  if (name === "test") renderQuestion();

  $all(".view").forEach((section) => {
    section.hidden = section.dataset.view !== name;
  });
  state.currentView = name;
  document.body.dataset.view = name;

  // 휴대폰 '뒤로가기' 버튼으로 앱 안에서 이전 화면으로 이동할 수 있게 기록
  if (push) history.pushState({ view: name }, "");

  window.scrollTo(0, 0);

  // 화면 전환 시 제목으로 포커스 이동 (스크린리더/키보드 사용자용)
  if (focus) {
    const heading = $(`.view[data-view="${name}"] [tabindex="-1"]`);
    if (heading) heading.focus({ preventScroll: true });
  }
}

// 브라우저/휴대폰 뒤로가기 처리
function handlePopState(event) {
  const target = (event.state && event.state.view) || "intro";
  showView(target, { push: false });
}

/** 짧은 안내 메시지 표시 */
let toastTimer = null;
function showToast(message, duration = 3200) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), duration);
}

/** 버튼 로딩 상태 on/off */
function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    if (loadingText) button.textContent = loadingText;
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
    button.classList.remove("is-loading");
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

/** HTML 의 data-bind 자리에 CONFIG 값을 채워 넣음 */
function applyConfigBindings() {
  const bindings = {
    questionCount: QUESTIONS.length,
    eventDateLabel: CONFIG.eventDateLabel,
    testTimeLabel: `${CONFIG.testStart} ~ ${CONFIG.testEnd}`,
    venue: CONFIG.venue,
    organizer: CONFIG.organizer,
    privacyDeleteNotice: CONFIG.privacyDeleteNotice,
  };
  $all("[data-bind]").forEach((node) => {
    const value = bindings[node.dataset.bind];
    if (value !== undefined) node.textContent = value;
  });
  $("#f-student-number-hint").textContent = CONFIG.studentNumberRule.hint;
}

/** 개발 모드 안내 띠 */
function setupDevBanner() {
  const banner = $("#dev-banner");
  if (!CONFIG.showDevBanner) return;
  const modeText = DataService === MockDataService
    ? "MOCK 개발 모드 · 새로고침하면 신청 데이터가 사라져요"
    : "SUPABASE 연결 모드 · 실제 데이터";
  banner.textContent = `🛠 ${modeText}`;
  banner.hidden = false;
}


/* =====================================================================
   8. 테스트(설문) 처리
   ===================================================================== */

let autoAdvanceTimer = null;
let lastPointerTime = 0; // 터치/클릭으로 선택했을 때만 자동으로 다음 문항으로 넘어가기 위함

/** 테스트 시작 (중간에 나갔다 오면 이어서 진행) */
function startTest() {
  const hasPartialProgress = !state.profile && Object.keys(state.answers).length > 0;
  if (!hasPartialProgress) {
    state.answers = {};
    state.currentQuestionIndex = 0;
    state.profile = null;
    state.explanation = null;
    state.sessionProfileId = null;
  }
  showView("test");
}

/** 현재 문항을 화면에 그림 (문항 수가 바뀌어도 자동 대응) */
function renderQuestion() {
  clearTimeout(autoAdvanceTimer);
  const total = QUESTIONS.length;
  const index = state.currentQuestionIndex;
  const question = QUESTIONS[index];
  const answered = state.answers[question.id] !== undefined;

  // 진행 표시: "3 / 16" + 진행바
  $("#question-counter").textContent = `${index + 1} / ${total}`;
  const progress = $("#test-progress");
  progress.setAttribute("aria-valuemax", String(total));
  progress.setAttribute("aria-valuenow", String(index + 1));
  progress.setAttribute("aria-valuetext", `${total}문항 중 ${index + 1}번째`);
  $("#test-progress-fill").style.width = `${((index + 1) / total) * 100}%`;

  // 문항 정보
  $("#question-format").textContent = question.format === "ab" ? "A/B 선택" : "5점 척도";
  $("#question-text").textContent = question.text;

  // 선택지 생성
  const container = $("#question-options");
  container.replaceChildren();
  const options = question.format === "ab"
    ? (question.options || []).map((o) => ({ value: o.key, label: o.text, key: o.key }))
    : LIKERT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

  options.forEach((option, i) => {
    const inputId = `q${question.id}-opt${i}`;
    const input = el("input", {
      type: "radio",
      id: inputId,
      name: `question-${question.id}`,
      value: String(option.value),
    });
    input.checked = answered && String(state.answers[question.id]) === String(option.value);

    const labelChildren = option.key
      ? [el("span", { class: "option-key", "aria-hidden": "true", text: option.key }), el("span", { text: option.label })]
      : [el("span", { class: "option-dot", "aria-hidden": "true" }), el("span", { text: option.label })];

    const label = el("label", {
      for: inputId,
      class: option.key ? "option-label option-label--ab" : "option-label",
    }, labelChildren);

    container.append(el("div", { class: "option" }, [input, label]));
  });

  // 버튼 상태
  $("#btn-prev").disabled = index === 0;
  const nextButton = $("#btn-next");
  nextButton.textContent = index === total - 1 ? "결과 보기 ✨" : "다음";
  nextButton.disabled = !answered;
  $("#test-error").textContent = "";

  // 카드 등장 애니메이션 재실행
  const card = $("#question-form");
  card.classList.remove("slide-in");
  void card.offsetWidth;
  card.classList.add("slide-in");
}

/** 선택지를 골랐을 때 */
function handleOptionChange(event) {
  const input = event.target;
  if (input.type !== "radio") return;
  const question = QUESTIONS[state.currentQuestionIndex];
  state.answers[question.id] = question.format === "likert" ? Number(input.value) : input.value;

  $("#btn-next").disabled = false;
  $("#test-error").textContent = "";

  // 터치/클릭으로 고른 경우 잠시 후 자동으로 다음 문항 (키보드 방향키 사용 시에는 자동 이동 안 함)
  const isPointer = Date.now() - lastPointerTime < 800;
  const isLast = state.currentQuestionIndex === QUESTIONS.length - 1;
  clearTimeout(autoAdvanceTimer);
  if (isPointer && !isLast) {
    autoAdvanceTimer = setTimeout(goNextQuestion, 320);
  }
}

function goPrevQuestion() {
  if (state.currentQuestionIndex === 0) return;
  state.currentQuestionIndex -= 1;
  renderQuestion();
  $("#question-text").focus({ preventScroll: true });
}

function goNextQuestion() {
  const question = QUESTIONS[state.currentQuestionIndex];
  if (state.answers[question.id] === undefined) {
    $("#test-error").textContent = "답변을 하나 선택해주세요 🙂";
    return;
  }
  if (state.currentQuestionIndex === QUESTIONS.length - 1) {
    finishTest();
    return;
  }
  state.currentQuestionIndex += 1;
  renderQuestion();
  $("#question-text").focus({ preventScroll: true });
}

function quitTest() {
  const ok = window.confirm("테스트를 그만둘까요?\n지금까지의 응답은 이 화면을 닫기 전까지 유지돼요.");
  if (ok) showView("intro");
}

/** 모든 문항 응답 확인 후 분석 시작 */
function finishTest() {
  const unansweredIndex = QUESTIONS.findIndex((q) => state.answers[q.id] === undefined);
  if (unansweredIndex !== -1) {
    const remaining = QUESTIONS.filter((q) => state.answers[q.id] === undefined).length;
    state.currentQuestionIndex = unansweredIndex;
    renderQuestion();
    $("#test-error").textContent = `아직 답하지 않은 문항이 ${remaining}개 있어요. 이 문항부터 답해주세요!`;
    return;
  }
  runAnalysis();
}

/** '분석 중' 연출 → 결과 계산 → 결과 화면 */
async function runAnalysis() {
  state.isAnalyzing = true;
  state.profile = calculateStudyProfile(state.answers);
  state.sessionProfileId = createId();
  showView("analyzing");

  const duration = prefersReducedMotion() ? 600 : CONFIG.analyzingDurationMs;
  const fill = $("#analyzing-fill");
  fill.style.setProperty("--analyzing-duration", `${duration}ms`);
  fill.classList.remove("is-running");
  void fill.offsetWidth;
  fill.classList.add("is-running");

  const steps = ["응답을 정리하는 중...", "STUDY 성향 점수를 계산하는 중...", "나와 맞는 STUDY MATE 유형을 찾는 중..."];
  const stepNode = $("#analyzing-step");
  steps.forEach((text, i) => {
    setTimeout(() => { if (state.isAnalyzing) stepNode.textContent = text; }, (duration / steps.length) * i);
  });

  // 기본 설명은 즉시 준비되고, AI 리포트는 연출 시간과 동시에 요청
  // → 최대 AI_CONFIG.maxWaitMs 안에 성공하면 AI 리포트, 실패·지연이면 기본 설명
  const [explanation] = await Promise.all([generateAIExplanation(state.profile), delay(duration)]);
  state.explanation = explanation;
  state.isAnalyzing = false;

  renderResult(state.profile, state.explanation);
  showView("result");
}


/* =====================================================================
   9. 결과 계산
   ---------------------------------------------------------------------
   흐름: 문항응답 → 문항 점수(0~100) → 3개 핵심 축 + 도전 자극도 → 유형 판정
   (계산식 설명은 4. SCORING_RULES 주석 참고 / AI 는 유형을 결정하지 않고 설명만 합니다)
   ===================================================================== */

/** 문항 하나의 0~100 점수 (응답이 없거나 잘못되면 null) */
function getItemScore(question, answer) {
  if (answer === undefined || answer === null) return null;
  if (question.format === "ab") {
    const option = (question.options || []).find((o) => o.key === answer);
    return option && Number.isFinite(option.value) ? option.value : null;
  }
  const base = SCORING_RULES.likertToScore[answer];
  if (base === undefined) return null;
  return question.direction === -1 ? 100 - base : base;
}

/** 문항 scale 별 평균 → { exploration, reflection, independent, collaborative, challenge } (응답 없으면 null) */
function averageItemScores(answers) {
  const sums = {};
  const counts = {};
  QUESTIONS.forEach((question) => {
    const value = getItemScore(question, answers[question.id]);
    if (value === null) return;
    sums[question.scale] = (sums[question.scale] || 0) + value;
    counts[question.scale] = (counts[question.scale] || 0) + 1;
  });
  const averages = {};
  SCORING_RULES.itemScales.forEach((scale) => {
    averages[scale] = counts[scale] ? sums[scale] / counts[scale] : null;
  });
  return averages;
}

function toProfileScore(value) {
  return Math.round(clamp(Number(value), 0, 100));
}

/**
 * 응답으로 STUDY PROFILE 계산
 * 반환 예: { version: "1.0", explorationScore: 75, reflectionScore: 56, relationshipScore: 64,
 *           challengeStimulus: 75, profileType: "strategic_collaborator" }
 */
function calculateStudyProfile(answers) {
  const avg = averageItemScores(answers);
  const missing = Object.keys(avg).filter((scale) => avg[scale] === null);
  if (missing.length) logError(`응답이 없는 척도 (${missing.join(", ")}) - 중간값 50 사용`, new AppError("INCOMPLETE"));
  const value = (scale) => (avg[scale] === null ? 50 : avg[scale]);

  return buildStudyProfile({
    explorationScore: value("exploration"),
    reflectionScore: value("reflection"),
    relationshipScore: 50 + (value("collaborative") - value("independent")) / 2,
    challengeStimulus: value("challenge"),
  });
}

/** 점수 4개 → 저장·표시용 STUDY PROFILE (점수 반올림 + 유형 판정). 개발용 MOCK 참가자 생성에도 사용 */
function buildStudyProfile({ explorationScore, reflectionScore, relationshipScore, challengeStimulus }) {
  const profile = {
    version: SCORING_RULES.version,
    explorationScore: toProfileScore(explorationScore),
    reflectionScore: toProfileScore(reflectionScore),
    relationshipScore: toProfileScore(relationshipScore),
    challengeStimulus: toProfileScore(challengeStimulus),
  };
  profile.profileType = determineProfileType({
    exploration: profile.explorationScore,
    reflection: profile.reflectionScore,
    relationship: profile.relationshipScore,
  }).id;
  return profile;
}

/** 서버에 저장할 study_profile_json (최종 계산값만, 원본 16문항 응답은 보내지 않음) */
function toStudyProfileRecord(profile) {
  return {
    version: profile.version,
    explorationScore: profile.explorationScore,
    reflectionScore: profile.reflectionScore,
    relationshipScore: profile.relationshipScore,
    challengeStimulus: profile.challengeStimulus,
    profileType: profile.profileType,
  };
}

/** 유형 판정용: 50 이상 high / 미만 low */
function axisLevel(score) {
  return Number(score) >= SCORING_RULES.typeThreshold ? "high" : "low";
}

/** 설명용: 0~44 low / 45~55 balanced / 56~100 high */
function axisBand(score) {
  const { min, max } = SCORING_RULES.balanceRange;
  const value = Number(score);
  if (value < min) return "low";
  if (value > max) return "high";
  return "balanced";
}

/** 세 축 점수 { exploration, reflection, relationship } → PROFILE_TYPES 중 하나 */
function determineProfileType(scores) {
  const found = PROFILE_TYPES.find((type) => AXIS_KEYS.every((axis) => type.when[axis] === axisLevel(scores[axis])));
  return found || UNKNOWN_PROFILE;
}

function getProfileType(profileTypeId) {
  return PROFILE_TYPES.find((t) => t.id === profileTypeId) || UNKNOWN_PROFILE;
}

/** 결과 화면용 BEST MATE 유형 (실제 매칭과 무관) */
function getBestMateType(profileTypeId) {
  return getProfileType(BEST_MATE_MAP[profileTypeId]);
}

/** 축 점수 설명 (45~55 는 균형 문구) → { band, text, title, low, high } */
function describeAxis(score, axisKey) {
  const axis = SCORING_RULES.axes[axisKey];
  const band = axisBand(score);
  return { band, text: axis.descriptions[band], title: axis.title, low: axis.low, high: axis.high };
}

function describeChallenge(score) {
  const band = axisBand(score);
  return { band, text: SCORING_RULES.challenge.descriptions[band] };
}

/** 축 상태 배지 문구: "🔎 자기탐색 쪽" / "⚖️ 균형" */
function axisBandLabel(axisKey, band) {
  const axis = SCORING_RULES.axes[axisKey];
  if (band === "balanced") return "⚖️ 균형";
  const side = band === "high" ? axis.high : axis.low;
  return `${side.emoji} ${side.label} 쪽`;
}

/** 결과 화면 그리기 */
function renderResult(profile, explanation) {
  const type = getProfileType(profile.profileType);

  $("#result-emoji").textContent = type.emoji;
  $("#result-name").textContent = type.name;
  $("#result-tagline").textContent = `“${type.tagline}”`;

  renderStudyBalance(profile);
  renderExtraStyle(profile);
  renderExplanation(explanation, profile);
}

/** 나의 STUDY BALANCE: 양 끝 의미 + 위치 표시 + 균형 설명 */
function renderStudyBalance(profile) {
  const box = $("#result-scores");
  const dots = [];
  box.replaceChildren(...AXIS_KEYS.map((axisKey) => {
    const score = profile[`${axisKey}Score`];
    const info = describeAxis(score, axisKey);
    const dot = el("span", { class: "axis-dot" });
    dots.push([dot, score]);
    return el("div", { class: `axis-row axis-row--${info.band}` }, [
      el("div", { class: "axis-head" }, [
        el("span", { class: "axis-title", text: info.title }),
        el("span", { class: `axis-band axis-band--${info.band}`, text: axisBandLabel(axisKey, info.band) }),
      ]),
      el("div", { class: "axis-ends", "aria-hidden": "true" }, [
        el("span", { text: `${info.low.emoji} ${info.low.label}` }),
        el("span", { text: `${info.high.emoji} ${info.high.label}` }),
      ]),
      el("div", { class: "axis-track", "aria-hidden": "true" }, [el("span", { class: "axis-balance-zone" }), dot]),
      el("p", { class: "axis-value" }, [`${info.high.emoji} ${info.high.label} `, el("strong", { text: `${score}%` })]),
      el("p", { class: "axis-desc", text: info.text }),
    ]);
  }));
  // 가운데(50)에서 출발해 점수 위치로 이동하는 애니메이션
  requestAnimationFrame(() => requestAnimationFrame(() => {
    dots.forEach(([dot, score]) => { dot.style.left = `${score}%`; });
  }));
}

/** EXTRA STYLE: 도전 자극도 (유형 판정에는 사용하지 않음) */
function renderExtraStyle(profile) {
  const score = profile.challengeStimulus;
  const info = describeChallenge(score);
  const fill = el("div", { class: "score-fill" });
  $("#result-extra").replaceChildren(
    el("div", { class: "score-head" }, [
      el("span", { class: "score-label", text: `${SCORING_RULES.challenge.emoji} ${SCORING_RULES.challenge.title}` }),
      el("span", { class: "score-value", text: `${score}%` }),
    ]),
    el("div", { class: "score-track", "aria-hidden": "true" }, fill),
    el("p", { class: "axis-desc", text: info.text }),
    el("p", { class: "scores-note", text: "도전 자극도는 대표 STUDY STYLE을 정하는 데에는 사용하지 않는 추가 정보예요." })
  );
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${score}%`; }));
}

/** 리포트(AI 또는 기본 설명) + 추천 STUDY MATE 영역 */
function renderExplanation(explanation, profile) {
  const box = $("#result-explanation");
  const block = (title, ...paragraphs) => el("div", { class: "report-block" }, [
    el("h3", { text: title }),
    ...paragraphs.filter(isNonEmptyString).map((text) => el("p", { text })),
  ]);

  box.replaceChildren(
    block("📚 나의 공부 특징", explanation.summary, explanation.studyTraits),
    block("💪 내가 잘 활용할 수 있는 강점", explanation.strengths),
    block("💬 스터디에서 해볼 만한 역할", explanation.studyRole),
    block("✏️ 한 번쯤 신경 써볼 부분", explanation.caution),
    el("p", {
      class: "report-source",
      text: explanation.source === "ai"
        ? "※ 계산된 점수를 바탕으로 AI가 문장을 다듬은 설명이에요. 유형과 점수는 AI가 정하지 않아요."
        : "※ STUDY MATE 기본 설명이에요.",
    })
  );

  const mate = getBestMateType(profile.profileType);
  $("#result-mate").replaceChildren(
    el("div", { class: "mate-emoji", "aria-hidden": "true", text: mate.emoji }),
    el("div", {}, [
      el("p", { class: "mate-title", text: mate.name }),
      el("p", { class: "mate-desc", text: `“${explanation.mateRecommendation}”` }),
      el("p", { class: "mate-note", text: "이런 유형과 공부해보는 것도 좋아요. 실제 STUDY MATE 매칭은 유형 이름이 아니라 세 가지 점수를 바탕으로 운영진이 정해요." }),
    ])
  );
}

/** 받침 유무에 따라 조사 선택: withJosa("탐색 방식", "은", "는") → "탐색 방식은" */
function withJosa(word, withBatchim, withoutBatchim) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`;
}


/* =====================================================================
   10. AI 개인화 리포트
   ---------------------------------------------------------------------
   - AI 는 이미 계산된 유형/점수를 '설명'만 합니다. (유형 결정 X)
   - 요청 데이터는 buildAIRequestPayload() 의 익명 값뿐입니다. (개인정보 없음)
   - AI 결과는 화면에만 표시하고 어디에도 저장하지 않습니다.
   - 꺼져 있음 / 오류 / 시간 초과(AI_CONFIG.maxWaitMs) / JSON 형식 오류 / 금지 표현 → 즉시 기본 설명
   - 서버 쪽 코드: supabase/functions/study-profile-report/index.ts
   ===================================================================== */
const AI_REPORT_FIELDS = ["summary", "studyTraits", "strengths", "caution", "studyRole", "mateRecommendation"];
const AI_REPORT_MAX_LENGTH = 400;

// 결과 문구에 나오면 안 되는 단정·과장 표현 (Edge Function 에서도 같은 검사를 합니다)
const AI_BLOCKED_PATTERNS = [
  /성적\S*\s*(향상|오르|올라|높아|높은|좋아)/, /공부를\s*잘/, /최적화/, /확실한/, /딱\s*맞는/,
  /지능|아이큐|\bIQ\b/i, /진로/, /소름/, /진짜\s*공부\s*성격/, /궁합\s*확률/, /완벽한/, /보장/,
];

function getAIEndpoint() {
  if (AI_CONFIG.endpoint) return AI_CONFIG.endpoint;
  return SUPABASE_CONFIG.url ? `${SUPABASE_CONFIG.url.replace(/\/+$/, "")}/functions/v1/study-profile-report` : "";
}

async function generateAIExplanation(profile) {
  const fallback = buildFallbackExplanation(profile);
  const endpoint = getAIEndpoint();
  if (!AI_CONFIG.enabled || !endpoint) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_CONFIG.maxWaitMs);
  try {
    const headers = { "Content-Type": "application/json" };
    const key = SUPABASE_CONFIG.anonKey;
    if (key) {
      headers.apikey = key;
      if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(buildAIRequestPayload(profile)),
      signal: controller.signal,
    });
    if (!response.ok) throw new AppError("SERVER");
    const data = await response.json();
    const report = parseAIReport(data && data.report);
    if (!report) throw new AppError("AI_INVALID");
    return { ...report, source: "ai" };
  } catch (error) {
    logError("AI 리포트 사용 안 함 - 기본 설명 표시", error && error.name === "AbortError" ? new AppError("TIMEOUT") : error);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

/** AI 에 보낼 데이터 (완전 익명: 유형·점수·균형 여부·추천 유형만) */
function buildAIRequestPayload(profile) {
  return {
    profileVersion: profile.version,
    profileType: profile.profileType,
    explorationScore: profile.explorationScore,
    reflectionScore: profile.reflectionScore,
    relationshipScore: profile.relationshipScore,
    challengeStimulus: profile.challengeStimulus,
    axisStatus: {
      exploration: axisBand(profile.explorationScore),
      reflection: axisBand(profile.reflectionScore),
      relationship: axisBand(profile.relationshipScore),
      challengeStimulus: axisBand(profile.challengeStimulus),
    },
    bestMateType: BEST_MATE_MAP[profile.profileType] || null,
  };
}

/** AI 응답 검사: 6개 항목 모두 짧은 한국어 문자열 + 금지 표현 없음 → 아니면 null (전체 기본 설명 사용) */
function parseAIReport(raw) {
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, ""));
    } catch (error) {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const report = {};
  for (const field of AI_REPORT_FIELDS) {
    const value = data[field];
    if (!isNonEmptyString(value) || value.length > AI_REPORT_MAX_LENGTH) return null;
    if (AI_BLOCKED_PATTERNS.some((pattern) => pattern.test(value))) return null;
    report[field] = value.trim();
  }
  return report;
}

/** 기본 설명 (AI 미사용/실패 시). 45~55 균형 축은 유형 설명을 단정하지 않도록 안내 문장을 덧붙임 */
function buildFallbackExplanation(profile) {
  const type = getProfileType(profile.profileType);
  const mate = getBestMateType(profile.profileType);
  const balancedTitles = AXIS_KEYS
    .filter((axis) => axisBand(profile[`${axis}Score`]) === "balanced")
    .map((axis) => SCORING_RULES.axes[axis].title);

  let studyTraits = type.description;
  if (balancedTitles.length === AXIS_KEYS.length) {
    studyTraits += " 다만 세 가지 축 모두 균형 영역에 가까워서, 상황에 따라 여러 공부 방식을 골고루 사용하는 모습이 함께 나타날 수 있어요.";
  } else if (balancedTitles.length) {
    studyTraits += ` 다만 ${withJosa(balancedTitles.join("·"), "은", "는")} 균형 영역에 가까워서, 이 부분은 상황에 따라 다르게 나타날 수 있어요.`;
  }

  return {
    summary: `현재 응답에서는 '${type.name}' 스타일에 가까운 공부 경향이 나타났어요.`,
    studyTraits,
    strengths: type.strength,
    caution: type.caution,
    studyRole: type.studyRole,
    mateRecommendation: mate.asMate
      ? `${withJosa(mate.asMate, "과", "와")} 함께하면 서로의 다른 방식을 경험해볼 수 있어요.`
      : "서로 다른 방식으로 공부하는 친구와 함께하면 새로운 방법을 경험해볼 수 있어요.",
    source: "fallback",
  };
}


/* =====================================================================
   11. 결과 카드 생성 (Canvas API → PNG, 외부 라이브러리 없음)
   ---------------------------------------------------------------------
   캡처·SNS 공유용: 유형 / 세 핵심 점수 / 도전 자극도 / BEST MATE 만 (긴 문장 없음)
   ===================================================================== */
let cardObjectUrl = null;

async function saveResultCard() {
  if (!state.profile) {
    showToast(ERROR_MESSAGES.NO_PROFILE);
    return;
  }
  try {
    const canvas = drawResultCard(state.profile);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new AppError("CARD_FAILED"))), "image/png");
    });
    if (cardObjectUrl) URL.revokeObjectURL(cardObjectUrl);
    cardObjectUrl = URL.createObjectURL(blob);

    const type = getProfileType(state.profile.profileType);
    $("#card-preview").src = cardObjectUrl;
    const download = $("#card-download");
    download.href = cardObjectUrl;
    download.download = `STUDY-MATE_${type.name.replace(/\s+/g, "")}.png`;
    openCardDialog();
  } catch (error) {
    logError("결과 카드 생성 실패", error);
    showToast(ERROR_MESSAGES.CARD_FAILED, 4000);
  }
}

/** 1080 x 1350 (인스타 4:5 비율) 결과 카드 그리기 */
function drawResultCard(profile) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError("CARD_FAILED");

  const type = getProfileType(profile.profileType);
  const mate = getBestMateType(profile.profileType);
  const FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
  const C = { navy: "#1E2A4A", muted: "#5B6480", pink: "#D23A73", lavender: "#8E5BD8", lavSoft: "#EEE9FF", pinkSoft: "#FFE3EC", line: "#ECE7F5" };
  const L = 160;       // 내용 왼쪽 끝
  const R = W - 160;   // 내용 오른쪽 끝

  // 배경
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#FFF9F3");
  bg.addColorStop(0.55, "#EEE9FF");
  bg.addColorStop(1, "#FFE3EC");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 장식 원
  ctx.fillStyle = "rgba(210, 58, 115, 0.10)";
  ctx.beginPath(); ctx.arc(980, 120, 160, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(142, 91, 216, 0.10)";
  ctx.beginPath(); ctx.arc(90, 1260, 190, 0, Math.PI * 2); ctx.fill();

  // 흰 카드
  ctx.save();
  ctx.shadowColor = "rgba(30, 42, 74, 0.15)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#FFFFFF";
  roundRectPath(ctx, 70, 70, W - 140, H - 140, 56);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // 상단 라벨
  ctx.fillStyle = C.pink;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText("S T U D Y   M A T E  ·  M Y   S T U D Y   S T Y L E", W / 2, 160);

  // 이모지 + 유형명 + 한 줄 소개
  ctx.font = `120px ${FONT}`;
  ctx.fillText(type.emoji, W / 2, 300);

  ctx.fillStyle = C.navy;
  ctx.font = `900 68px ${FONT}`;
  ctx.fillText(type.name, W / 2, 400, R - L);

  ctx.fillStyle = C.muted;
  ctx.font = `600 30px ${FONT}`;
  const taglineLines = wrapCanvasText(ctx, type.tagline, R - L).slice(0, 2);
  taglineLines.forEach((line, i) => ctx.fillText(line, W / 2, 458 + i * 42));
  let y = 458 + (taglineLines.length - 1) * 42 + 52;

  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
  y += 62;

  // 세 핵심 축: 제목 · 점수 / 막대 + 위치 점 / 양 끝 의미
  AXIS_KEYS.forEach((axisKey) => {
    const axis = SCORING_RULES.axes[axisKey];
    const score = profile[`${axisKey}Score`];

    ctx.textAlign = "left";
    ctx.fillStyle = C.navy;
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(axis.title, L, y);
    ctx.textAlign = "right";
    ctx.fillStyle = C.pink;
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText(`${axis.high.label} ${score}%`, R, y);

    const trackY = y + 24;
    const grad = ctx.createLinearGradient(L, 0, R, 0);
    grad.addColorStop(0, "#DCD2F6");
    grad.addColorStop(1, "#F8CFDE");
    ctx.fillStyle = grad;
    roundRectPath(ctx, L, trackY, R - L, 16, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(L + (R - L) / 2 - 2, trackY - 4, 4, 24);

    const dotX = L + (R - L) * (score / 100);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.arc(dotX, trackY + 8, 19, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.pink;
    ctx.beginPath(); ctx.arc(dotX, trackY + 8, 13, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = C.muted;
    ctx.font = `600 23px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(`${axis.low.emoji} ${axis.low.label}`, L, trackY + 62);
    ctx.textAlign = "right";
    ctx.fillText(`${axis.high.emoji} ${axis.high.label}`, R, trackY + 62);
    y += 136;
  });

  // EXTRA / BEST MATE 박스 (나란히)
  const boxY = Math.max(y + 4, 1000);
  const boxW = (R - L - 24) / 2;
  const boxH = 148;
  const drawBox = (x, fill, label, value) => {
    ctx.fillStyle = fill;
    roundRectPath(ctx, x, boxY, boxW, boxH, 30);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = C.pink;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(label, x + boxW / 2, boxY + 48);
    ctx.fillStyle = C.navy;
    let size = 34;
    ctx.font = `800 ${size}px ${FONT}`;
    while (ctx.measureText(value).width > boxW - 36 && size > 22) {
      size -= 2;
      ctx.font = `800 ${size}px ${FONT}`;
    }
    ctx.fillText(value, x + boxW / 2, boxY + 108);
  };
  drawBox(L, C.pinkSoft, "E X T R A", `${SCORING_RULES.challenge.emoji} ${SCORING_RULES.challenge.title} ${profile.challengeStimulus}%`);
  drawBox(L + boxW + 24, C.lavSoft, "B E S T   M A T E", `${mate.emoji} ${mate.name}`);

  // 하단 로고
  ctx.textAlign = "center";
  ctx.fillStyle = C.navy;
  ctx.font = `900 34px ${FONT}`;
  ctx.fillText(CONFIG.organizerEn, W / 2, H - 150);
  ctx.fillStyle = C.muted;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`STUDY MATE · ${CONFIG.eventDateLabel}`, W / 2, H - 116);
  ctx.font = `600 19px ${FONT}`;
  ctx.fillText("교육용 학습 스타일 체험 결과 · 전문 심리검사가 아니에요", W / 2, H - 88);
  return canvas;
}

function openCardDialog() {
  const dialog = $("#card-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeCardDialog() {
  const dialog = $("#card-dialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}


/* =====================================================================
   12. 참가 신청 (TYPE B)
   ===================================================================== */

/** 결과 화면의 [STUDY MATE 신청하기] */
async function onApplyClick(button) {
  if (!state.profile) {
    showToast(ERROR_MESSAGES.NO_PROFILE);
    return;
  }
  if (!isWithinSchedule()) {
    showClosedView("OUT_OF_SCHEDULE");
    return;
  }
  setButtonLoading(button, true, "신청 가능 여부 확인 중...");
  try {
    const status = await DataService.getApplicationStatus();
    if (!status.enabled) return showClosedView("APPLICATION_CLOSED");
    if (status.slotsFull) return showClosedView("SLOTS_FULL");
    if (status.isFull) return showClosedView("FULL");

    // 안내 화면 초기화 (동의 체크 해제)
    $("#consent-check").checked = false;
    $("#btn-notice-next").disabled = true;
    state.consentChecked = false;
    showView("notice");
  } catch (error) {
    logError("신청 가능 여부 확인 실패", error);
    showToast(getFriendlyMessage(error), 4000);
  } finally {
    setButtonLoading(button, false);
  }
}

/** 마감 화면 (사유별 문구) */
function showClosedView(reason) {
  const titles = {
    FULL: "오늘의 STUDY MATE 신청이<br>마감되었습니다 💔",
    SLOTS_FULL: "모든 타임이 마감되어<br>신청이 종료되었어요 💔",
    APPLICATION_CLOSED: "오늘의 STUDY MATE 신청이<br>마감되었습니다 💔",
    OUT_OF_SCHEDULE: "STUDY MATE 신청은<br>축제 당일에만 가능해요",
  };
  const descs = {
    FULL: "신청 정원이 모두 찼어요. STUDY STYLE TEST 결과는 계속 확인할 수 있어요.",
    OUT_OF_SCHEDULE: `${CONFIG.eventDateLabel} ${CONFIG.testStart}~${CONFIG.testEnd}, ${CONFIG.venue}에서 만나요! STUDY STYLE TEST는 계속 참여할 수 있어요.`,
  };
  // titles 는 위에 고정된 문구만 사용하므로 innerHTML 사용이 안전함
  $("#closed-title").innerHTML = titles[reason] || titles.FULL;
  $("#closed-desc").textContent = descs[reason] || "STUDY STYLE TEST 결과는 계속 확인할 수 있어요.";
  showView("closed");
}

/** 안내 화면 [다음] */
function onNoticeNext() {
  if (!$("#consent-check").checked) {
    showToast("안내 내용을 확인하고 체크해주세요.");
    return;
  }
  state.consentChecked = true;
  const type = getProfileType(state.profile.profileType);
  $("#form-linked-profile").textContent = `${type.emoji} ${type.name}`;
  clearFormErrors();
  showView("form");
}

/** 신청폼의 선택지(성별/학년/희망조건)를 CONFIG 로부터 생성 */
function renderFormOptions() {
  const groups = {
    grade: CONFIG.gradeOptions,
    gender: CONFIG.genderOptions,
    preferredGender: CONFIG.preferredGenderOptions,
    preferredGrade: CONFIG.preferredGradeOptions,
  };
  Object.entries(groups).forEach(([name, options]) => {
    const container = $(`[data-options="${name}"]`);
    container.replaceChildren(
      ...options.map((option, i) => {
        const id = `f-${name}-${i}`;
        return el("div", { class: "choice" }, [
          el("input", { type: "radio", id, name, value: option.value }),
          el("label", { for: id, text: option.label }),
        ]);
      })
    );
  });
}

/** 입력값 읽기 (검증 전) */
function readApplicationForm() {
  const form = $("#apply-form");
  const data = new FormData(form);
  return {
    studentNumber: String(data.get("studentNumber") || "").trim(),
    name: String(data.get("name") || "").trim(),
    phone: onlyDigits(String(data.get("phone") || "")),
    grade: String(data.get("grade") || ""),
    gender: String(data.get("gender") || ""),
    preferredGender: String(data.get("preferredGender") || ""),
    preferredGrade: String(data.get("preferredGrade") || ""),
  };
}

/** 입력값 검증 → { 필드명: 오류문구 } */
function validateApplication(values) {
  const errors = {};
  if (!values.studentNumber) errors.studentNumber = "학번을 입력해주세요.";
  else if (!CONFIG.studentNumberRule.pattern.test(values.studentNumber)) errors.studentNumber = CONFIG.studentNumberRule.hint;

  if (!values.name) errors.name = "이름을 입력해주세요.";
  else if (values.name.length < 2) errors.name = "이름을 2글자 이상 입력해주세요.";

  if (!values.phone) errors.phone = "휴대폰 번호를 입력해주세요.";
  else if (!/^01[016789][0-9]{7,8}$/.test(values.phone)) errors.phone = "휴대폰 번호를 다시 확인해주세요. (예: 010-1234-5678)";

  const inOptions = (value, options) => options.some((o) => String(o.value) === value);
  if (!inOptions(values.grade, CONFIG.gradeOptions)) errors.grade = "현재 학년을 선택해주세요.";
  if (!inOptions(values.gender, CONFIG.genderOptions)) errors.gender = "성별을 선택해주세요.";
  if (!inOptions(values.preferredGender, CONFIG.preferredGenderOptions)) errors.preferredGender = "매칭 희망 성별을 선택해주세요.";
  if (!inOptions(values.preferredGrade, CONFIG.preferredGradeOptions)) errors.preferredGrade = "매칭 희망 학년을 선택해주세요.";
  return errors;
}

const FIELD_ELEMENTS = {
  studentNumber: { input: "#f-student-number", error: "#f-student-number-error" },
  name: { input: "#f-name", error: "#f-name-error" },
  phone: { input: "#f-phone", error: "#f-phone-error" },
  grade: { group: "#fs-grade", error: "#f-grade-error" },
  gender: { group: "#fs-gender", error: "#f-gender-error" },
  preferredGender: { group: "#fs-preferred-gender", error: "#f-preferredGender-error" },
  preferredGrade: { group: "#fs-preferred-grade", error: "#f-preferredGrade-error" },
};

function showFormErrors(errors) {
  Object.entries(FIELD_ELEMENTS).forEach(([field, refs]) => {
    const message = errors[field] || "";
    $(refs.error).textContent = message;
    if (refs.input) $(refs.input).setAttribute("aria-invalid", message ? "true" : "false");
    if (refs.group) $(refs.group).classList.toggle("is-invalid", !!message);
  });
  // 첫 번째 오류 항목으로 포커스 이동
  const firstField = Object.keys(FIELD_ELEMENTS).find((f) => errors[f]);
  if (firstField) {
    const refs = FIELD_ELEMENTS[firstField];
    const target = refs.input ? $(refs.input) : $(`${refs.group} input`);
    target.focus();
    target.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

function clearFormErrors() {
  showFormErrors({});
  const alert = $("#form-error");
  alert.hidden = true;
  alert.textContent = "";
}

function showFormAlert(message) {
  const alert = $("#form-error");
  alert.textContent = message;
  alert.hidden = false;
}

/** 신청서 제출 */
async function handleApplicationSubmit(event) {
  event.preventDefault();
  if (state.isSubmitting) return; // 중복 제출 방지

  const values = readApplicationForm();
  const errors = validateApplication(values);
  $("#form-error").hidden = true;
  if (Object.keys(errors).length > 0) {
    showFormErrors(errors);
    return;
  }
  showFormErrors({});

  if (!isWithinSchedule()) {
    showClosedView("OUT_OF_SCHEDULE");
    return;
  }

  // 서버로 보낼 데이터 (학습 스타일 결과는 현재 세션 결과를 자동 연결)
  // ※ 서버(sm_submit_application)가 모든 값을 다시 검증하고 확인코드를 직접 생성합니다.
  const payload = {
    profileId: state.sessionProfileId,
    studentNumber: values.studentNumber,
    name: values.name,
    phone: values.phone,
    gender: values.gender,
    grade: values.grade,
    preferredGender: values.preferredGender,
    preferredGrade: values.preferredGrade,
    studyProfile: toStudyProfileRecord(state.profile),
    profileType: state.profile.profileType,
  };

  const button = $("#btn-submit");
  state.isSubmitting = true;
  setButtonLoading(button, true, "신청 중...");

  try {
    const result = await DataService.submitApplication(payload);

    // 성공: 화면의 개인정보 입력값 즉시 비우기
    $("#apply-form").reset();
    clearFormErrors();
    state.consentChecked = false;
    state.lastConfirmationCode = result.confirmationCode;

    $("#complete-code").textContent = result.confirmationCode;
    showView("complete");
  } catch (error) {
    logError("신청 저장 실패", error);
    const code = error instanceof AppError ? error.code : "";
    if (code === "FULL" || code === "SLOTS_FULL" || code === "APPLICATION_CLOSED") {
      showClosedView(code);
    } else if (code === "DUPLICATE" || code === "INVALID") {
      showFormAlert(ERROR_MESSAGES[code]);
    } else if (code === "NETWORK" || code === "TIMEOUT") {
      showFormAlert(`${ERROR_MESSAGES[code]} (입력한 내용은 그대로 있어요)`);
    } else {
      showFormAlert(ERROR_MESSAGES.SAVE_FAILED);
    }
  } finally {
    state.isSubmitting = false;
    setButtonLoading(button, false);
  }
}

/** 전화번호 입력 시 자동 하이픈 (010-1234-5678) */
function handlePhoneInput(event) {
  const input = event.target;
  input.value = formatPhone(onlyDigits(input.value).slice(0, 11));
}

/** 학번 입력 시 숫자만 */
function handleStudentNumberInput(event) {
  const input = event.target;
  const digits = onlyDigits(input.value);
  if (digits !== input.value) input.value = digits;
}

/** 운영시간 확인 (CONFIG.enforceEventSchedule 가 true 일 때만) */
function isWithinSchedule() {
  if (!CONFIG.enforceEventSchedule) return true;
  const now = new Date();
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return today === CONFIG.eventDate && time >= CONFIG.testStart && time < CONFIG.testEnd;
}


/* =====================================================================
   13. 확인코드
   ---------------------------------------------------------------------
   - 형식: SM-XXXXXX (6자리 무작위, 0/O/1/I/L 제외 → 31^6 ≈ 8.9억 가지, 학번/개인정보와 무관)
   - MOCK 모드: 브라우저에서 생성 후 중복 검사
   - Supabase 모드: 서버 함수(sm_submit_application)가 생성 + DB UNIQUE 제약으로 중복 방지
   - 조회 무차별 대입 방어: 서버(sm_lookup_match)가 실패 횟수를 IP 해시 기준으로 제한
   ===================================================================== */
function generateConfirmationCode(existingCodes = new Set()) {
  const { prefix, length, alphabet } = CONFIG.confirmationCode;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let body = "";
    for (let i = 0; i < length; i += 1) body += alphabet[secureRandomInt(alphabet.length)];
    const code = `${prefix}${body}`;
    if (!existingCodes.has(code)) return code;
  }
  throw new AppError("SAVE_FAILED");
}

/** 사용자가 입력한 코드 정리: SM-K7F2Q8 / sm-k7f2q8 / K7F2Q8 / sm k7f2 q8 → "SM-K7F2Q8"
 *  (서버 sm_lookup_match 도 같은 규칙으로 한 번 더 정리합니다) */
function normalizeConfirmationCode(input) {
  const { prefix, length } = CONFIG.confirmationCode;
  const prefixLetters = prefix.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const clean = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length === prefixLetters.length + length && clean.startsWith(prefixLetters)) {
    return `${prefix}${clean.slice(prefixLetters.length)}`;
  }
  return `${prefix}${clean}`;
}

function isValidConfirmationCode(code) {
  const { prefix, length, alphabet } = CONFIG.confirmationCode;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}[${escapeRegExp(alphabet)}]{${length}}$`);
  return pattern.test(code);
}


/* =====================================================================
   14. 결과 조회 (확인코드)
   - 학생에게는 상태/팀번호/STUDY MATCH 점수/타임만 보여주고, 상대 학생 정보는 절대 보여주지 않음
   ===================================================================== */
function openLookup() {
  const input = $("#f-code");
  $("#f-code-error").textContent = "";
  input.removeAttribute("aria-invalid");
  $("#lookup-result").replaceChildren();
  showView("lookup");

  if (state.lastConfirmationCode) {
    input.value = state.lastConfirmationCode;
    runLookup();
  } else {
    input.value = "";
  }
}

function handleLookupSubmit(event) {
  event.preventDefault();
  runLookup();
}

async function runLookup() {
  const input = $("#f-code");
  const errorNode = $("#f-code-error");
  const resultBox = $("#lookup-result");
  const code = normalizeConfirmationCode(input.value);

  if (!input.value.trim() || !isValidConfirmationCode(code)) {
    resultBox.replaceChildren();
    errorNode.textContent = ERROR_MESSAGES.INVALID_CODE_FORMAT;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }
  errorNode.textContent = "";
  input.removeAttribute("aria-invalid");
  input.value = code;

  const button = $("#btn-lookup");
  setButtonLoading(button, true, "조회 중...");
  resultBox.replaceChildren(
    el("div", { class: "status-card" }, [el("div", { class: "skeleton", style: "width:70%" }), el("div", { class: "skeleton", style: "width:50%" })])
  );

  try {
    const result = await DataService.lookupByCode(code);
    renderLookupResult(result);
  } catch (error) {
    logError("확인코드 조회 실패", error);
    const message = getFriendlyMessage(error);
    resultBox.replaceChildren(
      el("div", { class: "status-card status-card--error" }, [
        el("div", { class: "big-emoji", "aria-hidden": "true", text: "🔍" }),
        el("h2", { text: error instanceof AppError && error.code === "NOT_FOUND" ? "확인코드를 찾을 수 없어요" : "조회하지 못했어요" }),
        el("p", { text: message }),
      ])
    );
  } finally {
    setButtonLoading(button, false);
  }
}

/** 조회 결과 상태별 화면 */
function renderLookupResult(result) {
  const box = $("#lookup-result");
  const retryButton = () => el("button", { type: "button", class: "btn btn-secondary", "data-action": "lookup-retry", text: "🔄 다시 확인" });
  const statusCard = (emoji, title, desc, withRetry = false) => el("div", { class: "status-card" }, [
    el("div", { class: "big-emoji", "aria-hidden": "true", text: emoji }),
    el("h2", { text: title }),
    el("p", { text: desc }),
    withRetry ? retryButton() : null,
  ]);

  switch (result.status) {
    case "waiting":
      box.replaceChildren(statusCard("💌", "아직 STUDY MATE를 찾고 있어요.",
        "운영진이 당신과 잘 맞는 파트너를 찾고 있습니다. 잠시 후 [다시 확인]을 눌러주세요.", true));
      break;
    case "matched":
    case "checked_in":
    case "completed":
      if (!result.timeSlot || !result.teamCode) {
        box.replaceChildren(statusCard("🧩", "팀이 정해졌어요!",
          "참가 시간을 준비하고 있어요. 잠시 후 [다시 확인]을 눌러주세요.", true));
      } else {
        box.replaceChildren(buildMatchCard(result));
      }
      break;
    case "cancelled":
      box.replaceChildren(statusCard("🗂", "참가 신청이 취소되었습니다.",
        `궁금한 점이 있다면 ${CONFIG.venue} 운영진에게 문의해주세요. STUDY STYLE TEST는 계속 참여할 수 있어요.`));
      break;
    case "no_show":
      box.replaceChildren(statusCard("⏰", "참여 기록이 확인되지 않았어요",
        `배정된 시간에 참여하지 못한 것으로 기록되어 있어요. 사정이 있었다면 ${CONFIG.venue} 운영진에게 문의해주세요.`));
      break;
    default:
      box.replaceChildren(statusCard("❓", "상태를 확인할 수 없어요",
        `${CONFIG.venue} 운영진에게 확인코드를 보여주세요.`, true));
  }
}

/** 💘 IT'S A STUDY MATCH! 카드 */
function buildMatchCard(result) {
  const slot = result.timeSlot;
  const dateLabel = CONFIG.eventDate.replace(/-/g, ".");
  const extraMessage = result.status === "completed"
    ? "STUDY MATE 활동을 마쳤어요. 함께해줘서 고마워요! 📚"
    : "당신의 STUDY MATE는\n만남의 순간까지 비밀입니다.";

  return el("article", { class: "match-card", "aria-label": "매칭 결과" }, [
    el("div", { class: "match-hearts", "aria-hidden": "true" }, [
      el("span", { class: "heart-a", text: "💗" }),
      el("span", { class: "heart-b", text: "💜" }),
      el("span", { class: "heart-burst", text: "💘" }),
    ]),
    el("h2", { class: "match-kicker", text: "IT'S A STUDY MATCH!" }),
    el("p", { class: "match-team", text: `STUDY TEAM #${formatTeamCode(result.teamCode)}` }),
    el("div", { class: "match-score" }, [
      el("span", { class: "match-score-label", text: "STUDY MATCH" }),
      el("span", { class: "match-score-value", text: result.compatibilityScore === null || result.compatibilityScore === undefined ? "—" : String(result.compatibilityScore) }),
      el("span", { class: "match-score-note", text: "설문 응답을 바탕으로 한 교육용 추천 점수입니다." }),
    ]),
    el("dl", { class: "match-info" }, [
      el("div", { class: "match-info-time" }, [
        el("dt", { text: `${dateLabel} · ${slot.id} TIME` }),
        el("dd", { text: `${slot.start} ~ ${slot.end}` }),
      ]),
      el("div", {}, [el("dt", { text: "장소" }), el("dd", { text: CONFIG.venue })]),
      el("div", {}, [el("dt", { text: "운영" }), el("dd", { text: CONFIG.organizerEn })]),
    ]),
    el("p", { class: "match-secret" }, extraMessage.split("\n").flatMap((line, i) => (i ? [el("br"), line] : [line]))),
  ]);
}


/* =====================================================================
   15. 매칭 알고리즘
   ---------------------------------------------------------------------
   Human-in-the-loop: 시스템은 '추천'만, 최종 확정은 운영진이 합니다.
   - 축 이름·가중치를 코드에 직접 쓰지 않고 MATCHING_WEIGHTS / MATCH_REASON_RULES / CONFIG.matching 만 읽습니다.
   - HARD FILTER(성별·학년 희망) → 세 축 원점수로 STUDY MATCH 계산 (유형 이름·BEST_MATE_MAP 은 사용하지 않음)
   - 참가자 객체 형식 (관리자 데이터, camelCase)
     { id, name, gender, grade, preferredGender, preferredGrade,
       studyProfile: { version, explorationScore, reflectionScore, relationshipScore, challengeStimulus, profileType },
       status, matchId, ... }
   ===================================================================== */

// 참가 상태 / 팀 상태 한국어 표시
const STATUS_LABELS = {
  waiting: "매칭 대기",
  matched: "매칭 완료",
  checked_in: "입장 완료",
  completed: "체험 완료",
  cancelled: "취소",
  no_show: "노쇼",
};
const STATUS_ORDER = ["waiting", "matched", "checked_in", "completed", "cancelled", "no_show"];
const MATCHED_STATUSES = ["matched", "checked_in", "completed"];

const MATCH_STATUS_LABELS = {
  draft: "임시",
  confirmed: "확정",
  in_progress: "진행 중",
  completed: "종료",
  cancelled: "해체",
};

const SLOTS_FULL_ADMIN_MESSAGE = "모든 소개팅 타임이 배정되었습니다. 새 신청은 서버에서 자동으로 마감돼요. (STUDY STYLE TEST는 계속 이용 가능)";

// 희망 조건 표시 문구 (값은 CONFIG.preferredGenderOptions / preferredGradeOptions 의 value)
const PREFERENCE_TEXT = {
  gender: { same: "동성 희망", opposite: "이성 희망", any: "성별 무관" },
  grade: { same: "같은 학년 희망", different: "다른 학년 희망", any: "학년 무관" },
};
const PREFERENCE_SHORT = {
  gender: { same: "동성", opposite: "이성", any: "무관" },
  grade: { same: "같은 학년", different: "다른 학년", any: "무관" },
};

function optionLabel(options, value) {
  const found = options.find((o) => String(o.value) === String(value));
  return found ? found.label : "-";
}

/** 그룹 인원 범위 (서버 설정이 있으면 서버 값 우선) */
function getGroupSizeLimits() {
  const settings = state.admin.data && state.admin.data.settings;
  return {
    min: (settings && settings.minGroupSize) || CONFIG.minGroupSize,
    max: (settings && settings.maxGroupSize) || CONFIG.maxGroupSize,
  };
}

/** 참가자의 축 점수 (study_profile_json 의 explorationScore 등. 없으면 50 = 중간값) */
function axisScore(participant, axis) {
  const profile = participant && participant.studyProfile;
  if (!profile) return 50;
  const key = axis === "challengeStimulus" ? axis : `${axis}Score`;
  let raw = profile[key];
  if ((raw === undefined || raw === null) && profile.scores) raw = profile.scores[axis];
  const value = raw === undefined || raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? clamp(value, 0, 100) : 50;
}

/** 참가자 점수가 실제로 저장되어 있는지 (관리자 화면의 '(기본값)' 표시용) */
function hasAxisScore(participant, axis) {
  const profile = participant && participant.studyProfile;
  const key = axis === "challengeStimulus" ? axis : `${axis}Score`;
  return !!profile && Number.isFinite(Number(profile[key])) && profile[key] !== null;
}

function axisTitle(axis) {
  return (SCORING_RULES.axes[axis] && SCORING_RULES.axes[axis].title) || axis;
}

/** MATCHING_WEIGHTS → [{ axis, mode, weight, target }] (weight > 0 만) */
function getWeightEntries() {
  return Object.entries(MATCHING_WEIGHTS)
    .map(([axis, rule]) => ({
      axis,
      mode: rule.mode === "complement" ? "complement" : "similarity",
      weight: Number(rule.weight) || 0,
      target: rule.mode === "complement" ? clamp(Number(rule.targetDifference) || 0, 0, 100) : null,
    }))
    .filter((entry) => entry.weight > 0);
}

/** 비슷할수록 높음: 100 - |a - b| */
function computeSimilarityScore(a, b) {
  return clamp(100 - Math.abs(a - b), 0, 100);
}

/**
 * 차이가 targetDifference 일 때 100점, 거기서 멀어질수록 감점 (target 30 기준: 차이 0 → 57, 30 → 100, 100 → 0)
 * ※ 과학적으로 검증된 값이 아니라 STUDY MATE 운영 규칙입니다. (MATCHING_WEIGHTS 주석 참고)
 */
function computeComplementScore(a, b, targetDifference) {
  const diff = Math.abs(a - b);
  const target = clamp(Number(targetDifference) || 0, 0, 100);
  const maxDistance = Math.max(target, 100 - target) || 1;
  return clamp(100 - (Math.abs(diff - target) / maxDistance) * 100, 0, 100);
}

/** me 의 희망 조건을 other 가 만족하지 않는 항목 → ["gender", "grade"] */
function preferenceProblems(me, other) {
  const problems = [];
  const sameGender = me.gender === other.gender;
  const sameGrade = Number(me.grade) === Number(other.grade);
  if ((me.preferredGender === "same" && !sameGender) || (me.preferredGender === "opposite" && sameGender)) {
    problems.push("gender");
  }
  if ((me.preferredGrade === "same" && !sameGrade) || (me.preferredGrade === "different" && sameGrade)) {
    problems.push("grade");
  }
  return problems;
}

/** HARD FILTER: 두 학생이 서로의(양방향) 성별/학년 희망 조건을 만족하는지 */
function checkHardFilter(a, b) {
  const problems = [
    ...preferenceProblems(a, b).map((kind) => ({ participantId: a.id, kind })),
    ...preferenceProblems(b, a).map((kind) => ({ participantId: b.id, kind })),
  ];
  return { ok: problems.length === 0, problems };
}

/** 매칭 가능한 상태인지: 대기 중 + 팀 없음 (취소/노쇼/이미 매칭 제외) */
function isEligibleForMatching(participant) {
  return !!participant && participant.status === "waiting" && !participant.matchId;
}

function getEligibleParticipants(participants) {
  return (participants || []).filter(isEligibleForMatching);
}

/**
 * 두 참가자의 STUDY MATCH 점수 (HARD FILTER 를 먼저 확인)
 * → { valid, score(0~100 정수), problems, details: [{ axis, mode, weight, target, diff, score }], reasons, notes }
 */
function computePairCompatibility(a, b) {
  const hard = checkHardFilter(a, b);
  const details = [];
  let total = 0;
  let weightSum = 0;

  getWeightEntries().forEach(({ axis, mode, weight, target }) => {
    const x = axisScore(a, axis);
    const y = axisScore(b, axis);
    const score = mode === "complement" ? computeComplementScore(x, y, target) : computeSimilarityScore(x, y);
    total += weight * score;
    weightSum += weight;
    details.push({ axis, mode, weight, target, diff: Math.abs(x - y), score });
  });

  const { reasons, notes } = buildCompatibilityReasons(details, hard.ok);
  return {
    valid: hard.ok,
    score: weightSum > 0 ? Math.round(total / weightSum) : 0,
    problems: hard.problems,
    details,
    reasons,
    notes,
  };
}

/** 그룹 STUDY MATCH = 모든 2인 조합 점수의 평균(반올림). 한 쌍이라도 HARD FILTER 를 어기면 invalid */
function computeGroupCompatibility(members, { requireEligible = true } = {}) {
  const list = members.filter(Boolean);
  const { min, max } = getGroupSizeLimits();
  const sizeOk = list.length >= min && list.length <= max;
  const statusProblems = list.filter((p) => !isEligibleForMatching(p)).map((p) => p.id);

  const pairs = [];
  const problems = [];
  const problemKeys = new Set();
  const aggregate = new Map();

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const result = computePairCompatibility(list[i], list[j]);
      pairs.push({ aId: list[i].id, bId: list[j].id, valid: result.valid, score: result.score });
      result.problems.forEach((problem) => {
        const key = `${problem.participantId}:${problem.kind}`;
        if (!problemKeys.has(key)) {
          problemKeys.add(key);
          problems.push(problem);
        }
      });
      result.details.forEach((d) => {
        const item = aggregate.get(d.axis) || { ...d, diffSum: 0, scoreSum: 0, n: 0 };
        item.diffSum += d.diff;
        item.scoreSum += d.score;
        item.n += 1;
        aggregate.set(d.axis, item);
      });
    }
  }

  const score = pairs.length ? Math.round(pairs.reduce((sum, p) => sum + p.score, 0) / pairs.length) : 0;
  const details = Array.from(aggregate.values()).map((d) => ({
    axis: d.axis, mode: d.mode, weight: d.weight, target: d.target, diff: d.diffSum / d.n, score: d.scoreSum / d.n,
  }));
  const valid = sizeOk && pairs.length > 0 && problems.length === 0 && (!requireEligible || statusProblems.length === 0);
  const { reasons, notes } = buildCompatibilityReasons(details, pairs.length > 0 && problems.length === 0);

  return { valid, sizeOk, score, pairs, problems, statusProblems, details, reasons, notes };
}

/** 축별 점수 차이 → near / mid / far (similarity) · near / tooClose / tooFar (complement) */
function classifyAxisDetail(detail) {
  const range = MATCH_REASON_RULES.nearRange;
  if (detail.mode === "similarity") {
    if (detail.diff <= range) return "near";
    return detail.diff <= range * 2 ? "mid" : "far";
  }
  const gap = detail.diff - detail.target;
  if (Math.abs(gap) <= range) return "near";
  return gap < 0 ? "tooClose" : "tooFar";
}

/**
 * 추천 이유 (유형 이름이 아니라 실제 점수 차이 기준)
 * → { reasons: 최대 CONFIG.matching.maxReasons 개, notes: 참고 사항(차이가 큰 축) }
 */
function buildCompatibilityReasons(details, hardFilterOk) {
  const items = details
    .slice()
    .sort((x, y) => y.weight - x.weight)
    .map((d) => ({ d, level: classifyAxisDetail(d) }))
    .filter(({ d, level }) => MATCH_REASON_RULES.texts[d.axis] && MATCH_REASON_RULES.texts[d.axis][level]);
  const text = ({ d, level }) => MATCH_REASON_RULES.texts[d.axis][level];

  const reasons = items.filter((x) => x.level === "near").map(text);
  if (hardFilterOk) reasons.push(MATCH_REASON_RULES.hardFilterOk);
  items.filter((x) => x.level === "mid" || x.level === "tooClose").forEach((x) => reasons.push(text(x)));
  const notes = items.filter((x) => x.level === "far" || x.level === "tooFar").map(text);

  return { reasons: reasons.slice(0, CONFIG.matching.maxReasons), notes };
}

/** 추천 카드의 조건 문장 (성별·학년 충족은 추천 이유에 포함되므로 문제가 있을 때만 표시) */
function buildConditionLines(group, members) {
  const { min } = getGroupSizeLimits();
  const genderIssue = group.problems.some((p) => p.kind === "gender");
  const gradeIssue = group.problems.some((p) => p.kind === "grade");
  const size = members.length;
  let sizeText = `${size}인 팀`;
  if (size === CONFIG.recommendedGroupSize) sizeText += " (권장 인원)";
  else if (size === min) sizeText += " (최소 인원)";
  return [
    genderIssue ? "⚠️ 성별 희망 조건 불일치" : null,
    gradeIssue ? "⚠️ 학년 희망 조건 불일치" : null,
    `✓ ${sizeText}`,
  ].filter(Boolean);
}

/**
 * 추천 조합 생성
 * - 매칭 대기자만 사용, 모든 쌍이 HARD FILTER 를 통과하는 2~4명 조합을 전부 탐색
 * - 순위 = STUDY MATCH 점수 + 인원 보너스(CONFIG.matching.groupSizePreference: 3명 → 4명 → 2명)
 * - 같은 학생이 여러 추천에 들어갈 수 있음 (확정 후 데이터가 바뀌면 자동 재계산)
 */
function generateRecommendedGroups(participants, { limit = CONFIG.matching.topRecommendations, diversify = true } = {}) {
  const pool = getEligibleParticipants(participants);
  const n = pool.length;
  const { min, max } = getGroupSizeLimits();
  if (n < min) return [];

  // 쌍별 결과를 미리 계산 (같은 계산 반복 방지)
  const valid = Array.from({ length: n }, () => new Array(n).fill(false));
  const score = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const result = computePairCompatibility(pool[i], pool[j]);
      valid[i][j] = valid[j][i] = result.valid;
      score[i][j] = score[j][i] = result.score;
    }
  }

  const sizePreference = CONFIG.matching.groupSizePreference || {};
  const candidates = [];
  const pick = [];
  const CANDIDATE_LIMIT = 300000; // 비정상적으로 많은 조합 계산 방지

  (function visit(start, pairSum, pairCount) {
    if (candidates.length >= CANDIDATE_LIMIT) return;
    if (pick.length >= min) {
      const average = pairSum / pairCount;
      candidates.push({
        indexes: pick.slice(),
        score: average,
        rank: Math.round(average) + (Number(sizePreference[pick.length]) || 0),
      });
    }
    if (pick.length >= max) return;
    for (let k = start; k < n; k += 1) {
      let ok = true;
      let added = 0;
      for (const m of pick) {
        if (!valid[m][k]) { ok = false; break; }
        added += score[m][k];
      }
      if (!ok) continue;
      const before = pick.length;
      pick.push(k);
      visit(k + 1, pairSum + added, pairCount + before);
      pick.pop();
    }
  })(0, 0, 0);

  candidates.sort((x, y) => y.rank - x.rank || y.score - x.score);

  let chosen = candidates;
  if (diversify) {
    // 비슷한 조합만 반복되지 않도록 먼저 겹침 1명 이하로 고르고, 부족하면 나머지로 채움
    const overlap = (a, b) => a.indexes.filter((i) => b.indexes.includes(i)).length;
    chosen = [];
    for (const c of candidates) {
      if (chosen.length >= limit) break;
      if (chosen.every((o) => overlap(o, c) <= 1)) chosen.push(c);
    }
    for (const c of candidates) {
      if (chosen.length >= limit) break;
      if (!chosen.includes(c)) chosen.push(c);
    }
    chosen.sort((x, y) => y.rank - x.rank || y.score - x.score);
  }

  return chosen.slice(0, limit).map((c) => {
    const members = c.indexes.map((i) => pool[i]);
    const group = computeGroupCompatibility(members);
    return { ...group, members, memberIds: members.map((m) => m.id), rank: c.rank };
  });
}

/** [개발/검증용] 추천 상위부터 겹치지 않게 골라 전체 배정을 시뮬레이션 */
function simulateGreedyAssignment(participants, slotCount = CONFIG.timeSlots.length) {
  const all = generateRecommendedGroups(participants, { limit: Infinity, diversify: false });
  const used = new Set();
  const teams = [];
  for (const group of all) {
    if (teams.length >= slotCount) break;
    if (group.memberIds.some((id) => used.has(id))) continue;
    group.memberIds.forEach((id) => used.add(id));
    teams.push(group);
  }
  const leftover = getEligibleParticipants(participants).filter((p) => !used.has(p.id));
  return { teams, leftover, candidateCount: all.length };
}

/** 희망 조건 문구: ["이성 희망", "다른 학년 희망"] ('무관'은 제외) */
function describePreferences(participant) {
  const list = [];
  if (participant.preferredGender !== "any") list.push(PREFERENCE_TEXT.gender[participant.preferredGender] || "");
  if (participant.preferredGrade !== "any") list.push(PREFERENCE_TEXT.grade[participant.preferredGrade] || "");
  return list.filter(Boolean);
}

/** 매칭이 어려운 참가자 분석 → [{ participant, level: "blocked" | "limited", reason }] */
function analyzeHardToMatch(participants) {
  const pool = getEligibleParticipants(participants);
  const result = [];
  pool.forEach((p) => {
    const others = pool.filter((o) => o.id !== p.id);
    const fitsMine = others.filter((o) => preferenceProblems(p, o).length === 0);
    const mutual = fitsMine.filter((o) => preferenceProblems(o, p).length === 0);

    if (others.length === 0) {
      result.push({ participant: p, level: "blocked", reason: "현재 다른 매칭 대기자가 없음" });
    } else if (fitsMine.length === 0) {
      const conditions = describePreferences(p);
      const reason = conditions.length > 1
        ? `${conditions.join(" + ")} 조건을 동시에 만족하는 대기자가 없음`
        : `${conditions[0] || "희망"} 조건을 만족하는 대기자가 없음`;
      result.push({ participant: p, level: "blocked", reason });
    } else if (mutual.length === 0) {
      result.push({
        participant: p,
        level: "blocked",
        reason: `희망 조건에 맞는 대기자 ${fitsMine.length}명이 있지만, ${fitsMine.length === 1 ? "그 학생의" : "그 학생들의"} 희망 조건과 맞지 않음`,
      });
    } else if (mutual.length === 1) {
      result.push({ participant: p, level: "limited", reason: "서로 조건이 맞는 대기자가 1명뿐 (2인 팀만 가능)" });
    }
  });
  return result;
}


/* =====================================================================
   16. 관리자
   ---------------------------------------------------------------------
   - 비밀번호는 이 파일/브라우저 저장소에 저장하지 않습니다.
   - MOCK 모드: 4자 이상 아무 암호 (개발용, 실제 개인정보 없음)
   - Supabase 모드: Supabase Auth 의 signInWithPassword(관리자 이메일 + 입력한 비밀번호)
     → 서버 함수 sm_is_admin() 으로 '지정된 관리자 계정'인지 한 번 더 확인
   - 관리자 데이터 조회/변경은 모두 관리자 전용 RPC 로만 처리 (서버에서 관리자 재확인)
   ===================================================================== */

/* ---------- 16-1. 인증 ---------- */
async function authenticateAdmin(password) {
  const admin = state.admin;
  if (Date.now() < admin.lockedUntil) throw new AppError("ADMIN_LOCKED");

  try {
    admin.session = await DataService.adminSignIn(password);
    admin.failedAttempts = 0;
    return true;
  } catch (error) {
    if (error instanceof AppError && error.code === "ADMIN_AUTH_FAILED") {
      admin.failedAttempts += 1;
      if (admin.failedAttempts >= CONFIG.adminMaxAttempts) {
        admin.lockedUntil = Date.now() + CONFIG.adminLockSeconds * 1000;
        admin.failedAttempts = 0;
      }
    }
    throw error;
  }
}

/** [관리자] 버튼: 이미 로그인된 공식 세션이 있으면 바로 대시보드로 */
async function openAdminLogin(button) {
  if (state.admin.session) {
    enterAdminDashboard();
    return;
  }
  setButtonLoading(button, true, "확인 중...");
  try {
    const session = await DataService.adminRestoreSession();
    if (session) {
      state.admin.session = session;
      enterAdminDashboard();
      return;
    }
  } catch (error) {
    logError("관리자 세션 복원 실패", error);
  } finally {
    setButtonLoading(button, false);
  }
  showAdminLoginView();
}

function showAdminLoginView(message = "") {
  const notice = $("#admin-mock-notice");
  if (isMockMode()) {
    notice.textContent = "🛠 MOCK 개발 모드: 4자 이상 아무 암호나 입력하면 들어갈 수 있어요. 실제 운영에서는 Supabase 서버 인증을 사용합니다.";
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
  $("#f-admin-password").value = "";
  $("#f-admin-password-error").textContent = message;
  showView("adminLogin");
}

async function handleAdminLoginSubmit(event) {
  event.preventDefault();
  const input = $("#f-admin-password");
  const errorNode = $("#f-admin-password-error");
  const button = $("#btn-admin-login");
  const password = input.value;

  if (button.disabled) return; // 중복 제출 방지
  if (!password) {
    errorNode.textContent = "비밀번호를 입력해주세요.";
    input.setAttribute("aria-invalid", "true");
    return;
  }

  setButtonLoading(button, true, "확인 중...");
  try {
    await authenticateAdmin(password);
    input.value = "";
    errorNode.textContent = "";
    input.removeAttribute("aria-invalid");
    enterAdminDashboard();
  } catch (error) {
    logError("관리자 로그인 실패", error);
    input.value = "";
    input.setAttribute("aria-invalid", "true");
    errorNode.textContent = getFriendlyMessage(error);
  } finally {
    setButtonLoading(button, false);
  }
}

function enterAdminDashboard() {
  const notice = $("#admin-mode-notice");
  if (isMockMode()) {
    notice.textContent = "🛠 MOCK 개발 모드입니다. 데이터는 이 탭의 메모리에만 있고 새로고침하면 사라집니다.";
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
  showView("admin");
  startAdminAutoRefresh();
  refreshAdminDashboard();
}

async function adminLogout() {
  stopAdminAutoRefresh();
  closeAdminModal(true);
  try {
    await DataService.adminSignOut();
  } catch (error) {
    logError("관리자 로그아웃 처리", error);
  }
  clearAdminState();
  showView("intro");
  showToast("로그아웃했어요.");
}

/** 메모리와 화면에 남은 관리자 데이터(개인정보 포함)를 즉시 비움 */
function clearAdminState() {
  const admin = state.admin;
  admin.session = null;
  admin.data = null;
  admin.lastLoadedAt = null;
  admin.selected.clear();
  admin.recommendations = [];
  admin.recommendationKey = "";
  admin.search = "";
  admin.filter = "all";
  ["#admin-stats", "#admin-timeline", "#admin-hard", "#admin-recs", "#admin-manual", "#admin-table"].forEach((selector) => {
    $(selector).replaceChildren();
  });
  $("#admin-dev-output").textContent = "";
  $("#admin-dev-output").hidden = true;
  $("#admin-search").value = "";
  $("#admin-filter").value = "all";
  $("#admin-count").textContent = "";
  $("#admin-updated").textContent = "";
  hideAdminError();
}

function isAuthError(error) {
  return error instanceof AppError && (error.code === "AUTH_EXPIRED" || error.code === "NOT_ADMIN");
}

/** 세션 만료/권한 없음 → 데이터 비우고 로그인 화면으로 */
async function handleAdminAuthLost(error) {
  stopAdminAutoRefresh();
  closeAdminModal(true);
  try { await DataService.adminSignOut(); } catch (e) { /* 이미 만료된 세션 */ }
  clearAdminState();
  showAdminLoginView(getFriendlyMessage(error));
}

/* ---------- 16-2. 데이터 불러오기 / 갱신 ---------- */

/** 관리자 대시보드 데이터 (참가자 목록은 전화번호가 마스킹된 상태로 받음) */
async function fetchAdminParticipants() {
  const raw = await DataService.adminGetDashboard();
  const settings = raw.settings || {};
  const slotIds = Array.isArray(settings.timeSlotIds) && settings.timeSlotIds.length
    ? settings.timeSlotIds
    : CONFIG.timeSlots.map((s) => s.id);
  state.admin.data = {
    settings: {
      applicationsOpen: settings.applicationsOpen !== false,
      maxParticipants: Number(settings.maxParticipants) || CONFIG.maxParticipants,
      minGroupSize: Number(settings.minGroupSize) || CONFIG.minGroupSize,
      maxGroupSize: Number(settings.maxGroupSize) || CONFIG.maxGroupSize,
      timeSlotIds: slotIds,
    },
    participants: (raw.participants || []).map((p) => ({ ...p, grade: Number(p.grade) })),
    matches: (raw.matches || []).map((m) => ({ ...m, memberIds: Array.isArray(m.memberIds) ? m.memberIds : [] })),
  };
  state.admin.lastLoadedAt = new Date();
  return state.admin.data;
}

async function refreshAdminDashboard({ silent = false } = {}) {
  const admin = state.admin;
  if (!admin.session || admin.isLoading) return;
  admin.isLoading = true;
  const button = $("#btn-admin-refresh");
  if (!silent) {
    setButtonLoading(button, true, "불러오는 중...");
    if (!admin.data) {
      $("#admin-stats").replaceChildren(el("p", { class: "admin-hint", text: "데이터 불러오는 중..." }));
    }
  }
  try {
    await fetchAdminParticipants();
    hideAdminError();
    renderAdminDashboard();
  } catch (error) {
    logError("관리자 데이터 조회 실패", error);
    if (isAuthError(error)) {
      handleAdminAuthLost(error);
      return;
    }
    showAdminError(getAdminErrorMessage(error));
  } finally {
    admin.isLoading = false;
    if (!silent) setButtonLoading(button, false);
  }
}

function showAdminError(message) {
  const node = $("#admin-error");
  node.textContent = message;
  node.hidden = false;
}
function hideAdminError() {
  const node = $("#admin-error");
  node.textContent = "";
  node.hidden = true;
}

/** 관리자에게는 친절한 문구 + 오류 코드(개인정보 없음)를 함께 표시 */
function getAdminErrorMessage(error) {
  const code = error instanceof AppError ? error.code : (error && error.name) || "UNKNOWN";
  return `${getFriendlyMessage(error)} (코드: ${code})`;
}

/* ---------- 16-3. 조회 도우미 ---------- */
let adminIndex = { participants: new Map(), matches: new Map() };

function buildAdminIndex(data) {
  adminIndex = {
    participants: new Map(data.participants.map((p) => [p.id, p])),
    matches: new Map(data.matches.map((m) => [m.id, m])),
  };
}
function getParticipant(id) { return adminIndex.participants.get(id) || null; }
function getMatch(id) { return adminIndex.matches.get(id) || null; }

function isMockMode() { return DataService === MockDataService; }

function getActiveTimeSlots() {
  const ids = state.admin.data ? state.admin.data.settings.timeSlotIds : CONFIG.timeSlots.map((s) => s.id);
  return CONFIG.timeSlots.filter((slot) => ids.includes(slot.id));
}

function getActiveMatches() {
  return state.admin.data ? state.admin.data.matches.filter((m) => m.status !== "cancelled") : [];
}

function getUsedSlotIds() {
  return new Set(getActiveMatches().map((m) => m.timeSlot).filter(Boolean));
}

function getFreeTimeSlots() {
  const used = getUsedSlotIds();
  return getActiveTimeSlots().filter((slot) => !used.has(slot.id));
}

/** 이름 표시 ([이름 가리기] 체크 시 홍○○) */
function displayName(participant) {
  if (!participant) return "-";
  return state.admin.maskNames ? maskName(participant.name) : participant.name;
}
function displayStudentNumber(participant) {
  const value = String(participant.studentNumber || "");
  return state.admin.maskNames && value.length > 2 ? `${value.slice(0, -2)}**` : value;
}

function problemMessage(problem) {
  const who = displayName(getParticipant(problem.participantId));
  return `⚠️ ${who} 학생의 ${problem.kind === "gender" ? "성별" : "학년"} 선호 조건과 맞지 않습니다.`;
}

const SLOT_PHASE_LABELS = { before: "진행 전", live: "진행 중", done: "종료" };

/** 타임 진행 단계: 행사 날짜 + 타임 시각 기준 */
function getSlotPhase(slot, now = new Date()) {
  const start = new Date(`${CONFIG.eventDate}T${slot.start}:00`);
  const end = new Date(`${CONFIG.eventDate}T${slot.end}:00`);
  if (now < start) return "before";
  if (now < end) return "live";
  return "done";
}

/* ---------- 16-4. 대시보드 그리기 ---------- */
function renderAdminDashboard() {
  const data = state.admin.data;
  if (!data) return;
  buildAdminIndex(data);
  pruneSelection();
  updateRecommendations();

  renderAdminSettings();
  renderAdminStats();
  renderTimeline();
  renderHardToMatch();
  renderRecommendations();
  renderManualPanel();
  renderParticipantTable();

  $("#admin-dev-tools").hidden = !isMockMode();
  const time = state.admin.lastLoadedAt;
  const autoText = CONFIG.adminAutoRefreshSeconds > 0
    ? ` · ${CONFIG.adminAutoRefreshSeconds}초마다 자동 새로고침 (팝업·선택 중에는 일시정지)`
    : "";
  $("#admin-updated").textContent = time ? `마지막 갱신 ${formatClock(time)}${autoText}` : "";
}

function renderAdminSettings() {
  const { settings } = state.admin.data;
  $("#admin-open-toggle").checked = settings.applicationsOpen;
  const badge = $("#admin-open-state");
  const slotsFull = getFreeTimeSlots().length === 0;
  const accepting = settings.applicationsOpen && !slotsFull;
  badge.textContent = settings.applicationsOpen ? (slotsFull ? "타임 모두 배정 · 신규 신청 자동 마감" : "신청 받는 중") : "신청 마감됨";
  badge.className = `badge ${accepting ? "badge--ok" : "badge--off"}`;
  const maxInput = $("#admin-max-input");
  if (document.activeElement !== maxInput) maxInput.value = settings.maxParticipants;
}

function renderAdminStats() {
  const { participants, settings } = state.admin.data;
  const count = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  participants.forEach((p) => { if (count[p.status] !== undefined) count[p.status] += 1; });
  const active = participants.length - count.cancelled;
  const slots = getActiveTimeSlots();
  const freeSlots = getFreeTimeSlots().length;

  const stat = (label, value, sub, extraClass = "") => el("div", { class: `stat ${extraClass}` }, [
    el("p", { class: "stat-label", text: label }),
    el("p", { class: "stat-value", text: String(value) }),
    sub ? el("p", { class: "stat-sub", text: sub }) : null,
  ]);

  $("#admin-stats").replaceChildren(
    stat("테스트 참여", "현재 집계 안 함", "익명 로그 미수집", "stat--text"),
    stat("신청자", active, `정원 ${settings.maxParticipants}명 · 취소 제외`),
    stat(STATUS_LABELS.waiting, count.waiting),
    stat(STATUS_LABELS.matched, count.matched),
    stat(STATUS_LABELS.checked_in, count.checked_in),
    stat(STATUS_LABELS.completed, count.completed),
    stat(STATUS_LABELS.cancelled, count.cancelled),
    stat(STATUS_LABELS.no_show, count.no_show),
    stat("남은 신청 가능", Math.max(settings.maxParticipants - active, 0), "선착순"),
    stat("남은 타임", freeSlots, `전체 ${slots.length}타임`)
  );
}

function renderTimeline() {
  const now = new Date();
  const matchBySlot = new Map(getActiveMatches().filter((m) => m.timeSlot).map((m) => [m.timeSlot, m]));
  const fullNotice = $("#admin-slots-full");
  fullNotice.textContent = SLOTS_FULL_ADMIN_MESSAGE;
  fullNotice.hidden = getFreeTimeSlots().length > 0;

  $("#admin-timeline").replaceChildren(...getActiveTimeSlots().map((slot) => {
    const match = matchBySlot.get(slot.id);
    const phase = getSlotPhase(slot, now);
    const children = [
      el("span", { class: "slot-id", text: slot.id }),
      el("span", { class: "slot-time", text: `${slot.start}~${slot.end}` }),
      el("span", { class: `slot-phase phase-${phase}`, text: SLOT_PHASE_LABELS[phase] }),
      match
        ? el("span", { class: "slot-team", text: `TEAM #${formatTeamCode(match.teamCode)} · ${match.memberIds.length}명` })
        : el("span", { class: "slot-empty", text: "비어 있음" }),
    ];
    if (!match) return el("div", { class: `slot-card phase-${phase}` }, children);
    return el("button", {
      type: "button",
      class: `slot-card is-filled phase-${phase}`,
      "data-action": "open-team",
      "data-match-id": match.id,
      "aria-label": `${slot.id} 타임 STUDY TEAM #${formatTeamCode(match.teamCode)} 정보 보기`,
    }, children);
  }));
}

function renderHardToMatch() {
  const box = $("#admin-hard");
  const list = analyzeHardToMatch(state.admin.data.participants);
  if (!list.length) {
    box.replaceChildren(el("p", { class: "admin-hint", text: "현재 매칭이 어려운 대기자가 없어요." }));
    return;
  }
  box.replaceChildren(
    el("ul", { class: "hard-list" }, list.map(({ participant: p, level, reason }) => el("li", { class: `hard-item hard-${level}` }, [
      el("p", { class: "hard-name" }, [
        el("strong", { text: displayName(p) }),
        ` · ${optionLabel(CONFIG.gradeOptions, p.grade)} · ${optionLabel(CONFIG.genderOptions, p.gender)}`,
        ` · ${PREFERENCE_TEXT.gender[p.preferredGender] || "-"} · ${PREFERENCE_TEXT.grade[p.preferredGrade] || "-"}`,
      ]),
      el("p", { class: "hard-reason", text: `${level === "blocked" ? "⛔" : "⚠️"} ${reason}` }),
    ]))),
    el("p", { class: "admin-hint", text: "다른 학생이 자동으로 배정되지 않습니다. 필요하면 학생과 상의해 조건을 확인해주세요." })
  );
}

/** 대기자 구성이 바뀌었을 때만 추천을 다시 계산 */
function updateRecommendations(force = false) {
  const eligible = getEligibleParticipants(state.admin.data.participants);
  const { min, max } = getGroupSizeLimits();
  const key = `${min}-${max}|${eligible.map((p) => p.id).sort().join(",")}`;
  if (!force && key === state.admin.recommendationKey) return;
  state.admin.recommendations = generateRecommendedGroups(state.admin.data.participants);
  state.admin.recommendationKey = key;
}

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function renderRecommendations() {
  const box = $("#admin-recs");
  const recs = state.admin.recommendations;
  const freeSlots = getFreeTimeSlots();
  const eligibleCount = getEligibleParticipants(state.admin.data.participants).length;
  const { min } = getGroupSizeLimits();
  const nodes = [];

  if (!freeSlots.length) nodes.push(el("p", { class: "form-alert", text: SLOTS_FULL_ADMIN_MESSAGE }));

  if (!recs.length) {
    nodes.push(el("p", {
      class: "admin-hint",
      text: eligibleCount < min
        ? `추천하려면 매칭 대기자가 ${min}명 이상 필요해요. (현재 ${eligibleCount}명)`
        : "현재 대기자 중 희망 조건을 서로 만족하는 조합이 없어요. '매칭이 어려운 참가자'를 확인해주세요.",
    }));
    box.replaceChildren(...nodes);
    return;
  }

  recs.forEach((group, index) => {
    const stillValid = group.memberIds.every((id) => isEligibleForMatching(getParticipant(id)));
    nodes.push(el("article", { class: `rec-card${stillValid ? "" : " is-invalid"}` }, [
      el("div", { class: "rec-head" }, [
        el("h3", { class: "rec-title", text: `추천 조합 ${CIRCLED_NUMBERS[index] || index + 1}` }),
        el("p", { class: "rec-score" }, [
          el("span", { class: "rec-score-label", text: "STUDY MATCH" }),
          el("strong", { text: String(group.score) }),
        ]),
      ]),
      el("p", { class: "rec-members" }, group.members.map((m) => el("span", {
        class: "chip",
        text: `${displayName(m)} · ${optionLabel(CONFIG.gradeOptions, m.grade)} · ${getProfileType(m.profileType).emoji}`,
      }))),
      el("ul", { class: "rec-lines" }, buildConditionLines(group, group.members).map((t) => el("li", { text: t }))),
      el("ul", { class: "rec-reasons" }, group.reasons.map((t) => el("li", { text: t }))),
      group.notes.length ? el("ul", { class: "rec-notes" }, group.notes.map((t) => el("li", { text: `참고: ${t}` }))) : null,
      stillValid ? null : el("p", { class: "rec-invalid", text: "⚠️ 이미 팀이 정해진 학생이 포함되어 더 이상 사용할 수 없어요." }),
      el("div", { class: "rec-actions" }, [
        el("button", {
          type: "button", class: "btn btn-love btn-sm", "data-action": "rec-confirm", "data-rec-index": String(index),
          disabled: !stillValid || !freeSlots.length, text: "이 조합으로 진행",
        }),
        el("button", { type: "button", class: "btn btn-ghost btn-sm", "data-action": "rec-detail", "data-rec-index": String(index), text: "상세보기" }),
      ]),
    ]));
  });
  box.replaceChildren(...nodes);
}

/* ---------- 16-5. 수동 매칭 ---------- */

/** 새로고침 후 더 이상 대기 상태가 아닌 학생은 선택에서 제외 */
function pruneSelection() {
  const removed = [];
  state.admin.selected.forEach((id) => {
    if (!isEligibleForMatching(getParticipant(id))) {
      state.admin.selected.delete(id);
      removed.push(id);
    }
  });
  if (removed.length) showToast(`대기 상태가 아니게 된 학생 ${removed.length}명을 선택에서 제외했어요.`);
}

function toggleSelection(participantId, checked) {
  const selected = state.admin.selected;
  const { max } = getGroupSizeLimits();
  if (checked) {
    if (!isEligibleForMatching(getParticipant(participantId))) return;
    if (selected.size >= max) {
      showToast(`한 팀은 최대 ${max}명까지 선택할 수 있어요.`);
      renderParticipantTable();
      return;
    }
    selected.add(participantId);
  } else {
    selected.delete(participantId);
  }
  renderManualPanel();
  renderParticipantTable();
}

function renderManualPanel() {
  const box = $("#admin-manual");
  const members = Array.from(state.admin.selected).map(getParticipant).filter(Boolean);
  const { min, max } = getGroupSizeLimits();

  if (!members.length) {
    box.replaceChildren(el("p", { class: "admin-hint", text: `아래 참가자 목록에서 '매칭 대기' 학생의 체크박스를 선택하세요. (${min}~${max}명)` }));
    return;
  }

  const group = members.length >= 2 ? computeGroupCompatibility(members) : null;
  const warnings = [];
  if (members.length < min) warnings.push(`최소 ${min}명을 선택해주세요.`);
  if (members.length > max) warnings.push(`최대 ${max}명까지 선택할 수 있어요.`);
  if (group) {
    group.problems.forEach((problem) => warnings.push(problemMessage(problem)));
    group.statusProblems.forEach((id) => warnings.push(`⚠️ ${displayName(getParticipant(id))} 학생은 매칭 대기 상태가 아닙니다.`));
  }
  const freeSlots = getFreeTimeSlots();
  if (!freeSlots.length) warnings.push(`⚠️ ${SLOTS_FULL_ADMIN_MESSAGE}`);
  const canConfirm = !!group && group.valid && freeSlots.length > 0;

  box.replaceChildren(
    el("p", { class: "manual-count" }, [el("strong", { text: `선택 ${members.length}명` }), ` / ${min}~${max}명`]),
    el("div", { class: "manual-chips" }, members.map((m) => el("span", { class: "chip" }, [
      `${displayName(m)} · ${optionLabel(CONFIG.gradeOptions, m.grade)} · ${optionLabel(CONFIG.genderOptions, m.gender)}`,
      el("button", { type: "button", class: "chip-remove", "data-action": "manual-remove", "data-id": m.id, "aria-label": `${displayName(m)} 선택 해제`, text: "×" }),
    ]))),
    group ? el("p", { class: "manual-score" }, ["예상 STUDY MATCH ", el("strong", { text: String(group.score) })]) : null,
    warnings.length
      ? el("ul", { class: "manual-warnings" }, warnings.map((t) => el("li", { text: t })))
      : el("p", { class: "manual-ok", text: "✓ 모든 학생의 희망 조건을 서로 만족해요." }),
    el("div", { class: "rec-actions" }, [
      el("button", { type: "button", class: "btn btn-love btn-sm", "data-action": "manual-confirm", disabled: !canConfirm, text: "선택한 학생으로 팀 확정" }),
      el("button", { type: "button", class: "btn btn-ghost btn-sm", "data-action": "manual-clear", text: "선택 해제" }),
    ])
  );
}

/* ---------- 16-6. 참가자 표 ---------- */
function getFilteredParticipants() {
  const { search, filter, sortDesc } = state.admin;
  const query = search.trim().toLowerCase();
  return state.admin.data.participants
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) => !query || String(p.name).toLowerCase().includes(query) || String(p.studentNumber).includes(query))
    .sort((a, b) => {
      const diff = new Date(a.createdAt) - new Date(b.createdAt);
      return sortDesc ? -diff : diff;
    });
}

function renderParticipantTable() {
  const box = $("#admin-table");
  const all = state.admin.data.participants;
  const rows = getFilteredParticipants();
  $("#admin-count").textContent = `${rows.length}명 표시 / 전체 ${all.length}명`;

  if (!rows.length) {
    box.replaceChildren(el("p", { class: "admin-hint table-empty", text: all.length ? "조건에 맞는 참가자가 없어요." : "아직 신청자가 없어요." }));
    return;
  }

  const headers = ["선택", "이름", "학번", "학년", "성별", "희망 성별", "희망 학년", "STUDY TYPE", "신청시간", "상태", "팀", "타임", ""];
  const thead = el("thead", {}, el("tr", {}, headers.map((h) => el("th", { scope: "col", text: h }))));
  const tbody = el("tbody", {}, rows.map((p) => {
    const match = p.matchId ? getMatch(p.matchId) : null;
    const type = getProfileType(p.profileType);
    const eligible = isEligibleForMatching(p);
    const statusSelect = el("select", {
      class: `status-select status-${p.status}`, "data-status-id": p.id, "aria-label": `${displayName(p)} 상태 변경`,
    }, STATUS_ORDER.map((s) => el("option", {
      value: s,
      text: STATUS_LABELS[s],
      selected: s === p.status,
      disabled: MATCHED_STATUSES.includes(s) && !p.matchId,
    })));
    return el("tr", { class: state.admin.selected.has(p.id) ? "is-selected" : null }, [
      el("td", {}, eligible
        ? el("input", { type: "checkbox", "data-select-id": p.id, checked: state.admin.selected.has(p.id), "aria-label": `${displayName(p)} 선택` })
        : el("span", { class: "muted", text: "-" })),
      el("td", { class: "cell-name", text: displayName(p) }),
      el("td", { text: displayStudentNumber(p) }),
      el("td", { text: optionLabel(CONFIG.gradeOptions, p.grade) }),
      el("td", { text: optionLabel(CONFIG.genderOptions, p.gender) }),
      el("td", { text: PREFERENCE_SHORT.gender[p.preferredGender] || "-" }),
      el("td", { text: PREFERENCE_SHORT.grade[p.preferredGrade] || "-" }),
      el("td", {}, el("button", {
        type: "button", class: "btn-text", "data-action": "open-profile", "data-id": p.id,
        "aria-label": `${displayName(p)} STUDY PROFILE 보기`, text: `${type.emoji} ${type.name}`,
      })),
      el("td", { text: formatDateTimeShort(p.createdAt) }),
      el("td", {}, statusSelect),
      el("td", {}, match
        ? el("button", { type: "button", class: "btn-text", "data-action": "open-team", "data-match-id": match.id, text: `#${formatTeamCode(match.teamCode)}` })
        : "-"),
      el("td", { text: match && match.timeSlot ? match.timeSlot : "-" }),
      el("td", {}, el("button", { type: "button", class: "btn btn-ghost btn-xs", "data-action": "open-participant", "data-id": p.id, text: "상세" })),
    ]);
  }));
  box.replaceChildren(el("table", { class: "admin-table" }, [thead, tbody]));
}

function handleAdminTableChange(event) {
  const target = event.target;
  if (target.matches("input[data-select-id]")) {
    toggleSelection(target.dataset.selectId, target.checked);
  } else if (target.matches("select[data-status-id]")) {
    onStatusSelectChange(target);
  }
}

/* ---------- 16-7. 팝업(모달) ---------- */
function openAdminModal({ title, body = [], actions = [], wide = false }) {
  const dialog = $("#admin-modal");
  $("#admin-modal-title").textContent = title;
  $("#admin-modal-body").replaceChildren(...[].concat(body).filter(Boolean));
  const errorNode = $("#admin-modal-error");
  errorNode.hidden = true;
  errorNode.textContent = "";

  const variants = { primary: "btn-primary", love: "btn-love", danger: "btn-danger", secondary: "btn-ghost" };
  $("#admin-modal-actions").replaceChildren(...actions.map((action) => {
    const button = el("button", {
      type: "button",
      class: `btn ${variants[action.variant] || "btn-ghost"}`,
      id: action.id || null,
      disabled: !!action.disabled,
      text: action.label,
    });
    button.addEventListener("click", () => {
      if (action.close) closeAdminModal();
      else runModalAction(button, action);
    });
    return button;
  }));

  dialog.classList.toggle("is-wide", wide);
  if (!dialog.open) dialog.showModal();
}

function closeAdminModal(force = false) {
  const dialog = $("#admin-modal");
  if (!dialog.open) return;
  if (state.admin.busy && !force) return;
  dialog.close();
}

function isAdminModalOpen() { return $("#admin-modal").open; }

function showModalError(message) {
  const node = $("#admin-modal-error");
  node.textContent = message;
  node.hidden = false;
}

/** 작업 실행 공통: 중복 실행 방지 + 로딩 표시 + 오류 처리 */
async function runAdminTask(button, loadingText, task) {
  if (state.admin.busy) return false;
  state.admin.busy = true;
  setButtonLoading(button, true, loadingText);
  try {
    await task();
    return true;
  } catch (error) {
    handleAdminActionError(error);
    return false;
  } finally {
    state.admin.busy = false;
    setButtonLoading(button, false);
  }
}

/** 팝업 버튼: onClick 이 true 를 돌려주면 팝업을 닫지 않음 (다음 단계 팝업 등) */
async function runModalAction(button, action) {
  let keepOpen = false;
  const ok = await runAdminTask(button, action.loadingText || "처리 중...", async () => {
    keepOpen = await action.onClick();
  });
  if (ok && !keepOpen) closeAdminModal();
}

function handleAdminActionError(error) {
  logError("관리자 작업 실패", error);
  if (isAuthError(error)) {
    handleAdminAuthLost(error);
    return;
  }
  const message = getAdminErrorMessage(error);
  if (isAdminModalOpen()) showModalError(message);
  else showToast(message, 5000);

  // 다른 기기에서 데이터가 바뀌었을 수 있는 오류 → 최신 데이터로 다시 그림
  const staleCodes = ["MEMBER_NOT_WAITING", "SLOT_TAKEN", "MEMBER_NOT_FOUND", "MATCH_NOT_FOUND", "HARD_FILTER", "GROUP_TOO_SMALL"];
  if (error instanceof AppError && staleCodes.includes(error.code)) refreshAdminDashboard({ silent: true });
}

function infoRow(label, value) {
  return el("div", { class: "info-row" }, [el("dt", { text: label }), el("dd", {}, value)]);
}

/* ---------- 16-8. 팀 확정 / 타임 배정 ---------- */

/** 확정 확인 팝업 (추천 카드 / 수동 매칭 공통) */
function openConfirmMatchModal(memberIds) {
  const members = memberIds.map(getParticipant);
  if (members.some((m) => !m)) {
    showToast(ERROR_MESSAGES.MEMBER_NOT_FOUND);
    return;
  }
  const group = computeGroupCompatibility(members);
  const freeSlots = getFreeTimeSlots();
  const freeIds = new Set(freeSlots.map((s) => s.id));

  const slotSelect = el("select", { id: "confirm-slot", class: "input" }, getActiveTimeSlots().map((slot) => el("option", {
    value: slot.id,
    disabled: !freeIds.has(slot.id),
    text: `${slot.id} TIME · ${slot.start}~${slot.end}${freeIds.has(slot.id) ? "" : " (사용 중)"}`,
  })));
  if (freeSlots.length) slotSelect.value = freeSlots[0].id; // 기본값: 가장 빠른 빈 타임

  const problemLines = [
    ...group.problems.map(problemMessage),
    ...group.statusProblems.map((id) => `⚠️ ${displayName(getParticipant(id))} 학생은 매칭 대기 상태가 아닙니다.`),
    ...(group.sizeOk ? [] : [ERROR_MESSAGES.GROUP_SIZE]),
  ];
  const canConfirm = group.valid && freeSlots.length > 0;

  openAdminModal({
    title: "STUDY TEAM 확정",
    body: [
      el("p", { class: "modal-lead", text: "아래 구성으로 STUDY TEAM을 확정하시겠습니까?" }),
      el("ul", { class: "modal-members" }, members.map((m) => el("li", {}, [
        el("strong", { text: displayName(m) }),
        ` · ${optionLabel(CONFIG.gradeOptions, m.grade)} · ${optionLabel(CONFIG.genderOptions, m.gender)} · ${getProfileType(m.profileType).emoji} ${getProfileType(m.profileType).name}`,
      ]))),
      el("p", { class: "modal-score" }, ["STUDY MATCH ", el("strong", { text: String(group.score) }), el("span", { class: "muted", text: " (설문 응답 기반 교육용 추천 점수)" })]),
      el("ul", { class: "rec-lines" }, [
        ...buildConditionLines(group, members).map((t) => el("li", { text: t })),
        ...problemLines.map((t) => el("li", { class: "is-warning", text: t })),
      ]),
      group.reasons.length ? el("ul", { class: "rec-reasons" }, group.reasons.map((t) => el("li", { text: t }))) : null,
      freeSlots.length
        ? el("div", { class: "field" }, [el("label", { for: "confirm-slot", text: "소개팅 타임" }), slotSelect])
        : el("p", { class: "form-alert", text: SLOTS_FULL_ADMIN_MESSAGE }),
    ],
    actions: [
      { label: "취소", variant: "secondary", close: true },
      {
        label: "확정",
        variant: "love",
        disabled: !canConfirm,
        loadingText: "매칭 확정 중...",
        onClick: () => createManualMatch(memberIds, slotSelect.value, group),
      },
    ],
  });
}

/** 팀 확정 (서버가 대기 상태·팀 없음·빈 타임·HARD FILTER 를 다시 검증) */
async function createManualMatch(memberIds, slotId, group) {
  if (!slotId || !getFreeTimeSlots().some((s) => s.id === slotId)) throw new AppError(slotId ? "SLOT_TAKEN" : "NO_FREE_SLOT");
  const result = await DataService.adminCreateMatch({
    memberIds,
    timeSlot: slotId,
    compatibilityScore: group.score,
    compatibilityReason: { reasons: group.reasons, notes: group.notes, score: group.score, version: CONFIG.studyProfileVersion },
  });
  memberIds.forEach((id) => state.admin.selected.delete(id));
  showToast(`STUDY TEAM #${formatTeamCode(result.teamCode)} 확정 · ${result.timeSlot} TIME`);
  await refreshAdminDashboard({ silent: true });
}

/** 팀 타임 변경 */
async function assignTimeSlot(matchId, slotId) {
  const result = await DataService.adminAssignTimeSlot(matchId, slotId);
  showToast(`${result.timeSlot} TIME으로 변경했어요.`);
  await refreshAdminDashboard({ silent: true });
}

/** 팀 정보 팝업 (타임라인 / 참가자 표의 팀 버튼) */
function openTeamModal(matchId) {
  const match = getMatch(matchId);
  if (!match) return;
  const members = match.memberIds.map(getParticipant).filter(Boolean);
  const slot = findTimeSlot(match.timeSlot);
  const { min } = getGroupSizeLimits();
  const reasonData = match.compatibilityReason;
  const reasons = Array.isArray(reasonData) ? reasonData : (reasonData && Array.isArray(reasonData.reasons) ? reasonData.reasons : []);
  const notes = reasonData && Array.isArray(reasonData.notes) ? reasonData.notes : [];

  const freeIds = new Set(getFreeTimeSlots().map((s) => s.id));
  const slotSelect = el("select", { id: "team-slot", class: "input input--sm" }, getActiveTimeSlots().map((s) => el("option", {
    value: s.id,
    disabled: !(freeIds.has(s.id) || s.id === match.timeSlot),
    selected: s.id === match.timeSlot,
    text: `${s.id} · ${s.start}~${s.end}${s.id === match.timeSlot ? " (현재)" : freeIds.has(s.id) ? "" : " (사용 중)"}`,
  })));
  const slotButton = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: "타임 변경" });
  slotButton.addEventListener("click", () => {
    if (slotSelect.value === match.timeSlot) return;
    runAdminTask(slotButton, "변경 중...", async () => {
      await assignTimeSlot(match.id, slotSelect.value);
      closeAdminModal(true);
    });
  });

  const activeCount = members.filter((m) => m.status !== "no_show").length;
  openAdminModal({
    title: `STUDY TEAM #${formatTeamCode(match.teamCode)}`,
    body: [
      el("dl", { class: "info-list" }, [
        infoRow("타임", slot ? `${slot.id} TIME · ${slot.start}~${slot.end} (${SLOT_PHASE_LABELS[getSlotPhase(slot)]})` : "-"),
        infoRow("STUDY MATCH", match.compatibilityScore !== null && match.compatibilityScore !== undefined ? String(Math.round(match.compatibilityScore)) : "-"),
        infoRow("팀 상태", MATCH_STATUS_LABELS[match.status] || match.status),
      ]),
      el("ul", { class: "modal-members" }, members.map((m) => el("li", {}, [
        el("strong", { text: displayName(m) }),
        ` · ${optionLabel(CONFIG.gradeOptions, m.grade)} · ${optionLabel(CONFIG.genderOptions, m.gender)} · `,
        el("span", { class: `status-pill status-${m.status}`, text: STATUS_LABELS[m.status] }),
      ]))),
      activeCount < min ? el("p", { class: "form-alert", text: `노쇼를 제외하면 ${activeCount}명만 남았어요. 필요하면 팀을 해체하고 다시 매칭해주세요.` }) : null,
      reasons.length ? el("ul", { class: "rec-reasons" }, reasons.map((t) => el("li", { text: String(t) }))) : null,
      notes.length ? el("ul", { class: "rec-notes" }, notes.map((t) => el("li", { text: `참고: ${String(t)}` }))) : null,
      el("div", { class: "inline-form" }, [el("label", { for: "team-slot", text: "타임 변경" }), slotSelect, slotButton]),
      el("p", { class: "admin-hint", text: "학생 상태(입장/체험 완료/노쇼/취소)는 참가자 목록의 상태 칸에서 바꿀 수 있어요." }),
    ],
    actions: [
      { label: "팀 해체", variant: "danger", onClick: () => { openDissolveModal(match.id); return true; } },
      { label: "닫기", variant: "secondary", close: true },
    ],
  });
}

function openDissolveModal(matchId) {
  const match = getMatch(matchId);
  if (!match) return;
  openAdminModal({
    title: `STUDY TEAM #${formatTeamCode(match.teamCode)} 해체`,
    body: [
      el("p", { text: "팀을 해체하면 학생들은 '매칭 대기'로 돌아가고 타임이 비게 됩니다. (노쇼 학생은 노쇼 유지)" }),
      el("p", { text: "다른 학생은 자동으로 추가되지 않습니다. 해체 후 추천/수동 매칭으로 다시 팀을 만들어주세요." }),
    ],
    actions: [
      { label: "취소", variant: "secondary", close: true },
      {
        label: "팀 해체",
        variant: "danger",
        loadingText: "해체 중...",
        onClick: async () => {
          await DataService.adminDissolveMatch(matchId);
          showToast(`STUDY TEAM #${formatTeamCode(match.teamCode)}을(를) 해체했어요.`);
          await refreshAdminDashboard({ silent: true });
        },
      },
    ],
  });
}

/** 추천 상세: 쌍별 점수와 축별 차이 */
function openRecommendationDetail(index) {
  const group = state.admin.recommendations[index];
  if (!group) return;
  const pairRows = group.pairs.map((pair) => el("li", {
    text: `${displayName(getParticipant(pair.aId))} ↔ ${displayName(getParticipant(pair.bId))} : STUDY MATCH ${pair.score}`,
  }));
  const axisRows = group.details.map((d) => el("li", {
    text: `${axisTitle(d.axis)} · ${d.mode === "similarity" ? "비슷할수록 +" : `차이 ${d.target}점 근처일수록 +`} · 평균 차이 ${Math.round(d.diff)}점 → ${Math.round(d.score)}점 × 가중치 ${d.weight}`,
  }));
  openAdminModal({
    title: `추천 조합 ${CIRCLED_NUMBERS[index] || index + 1} 상세`,
    wide: true,
    body: [
      el("p", { class: "modal-score" }, ["STUDY MATCH ", el("strong", { text: String(group.score) }), el("span", { class: "muted", text: " (모든 2인 조합 점수의 평균)" })]),
      el("ul", { class: "modal-members" }, group.members.map((m) => el("li", {}, [
        el("strong", { text: displayName(m) }),
        ` · ${optionLabel(CONFIG.gradeOptions, m.grade)} · ${optionLabel(CONFIG.genderOptions, m.gender)} · ${PREFERENCE_TEXT.gender[m.preferredGender]} · ${PREFERENCE_TEXT.grade[m.preferredGrade]} · ${formatProfileSummary(m)}`,
      ]))),
      el("h3", { class: "modal-subtitle", text: "2인 조합별 점수" }),
      el("ul", { class: "detail-list" }, pairRows),
      el("h3", { class: "modal-subtitle", text: "축별 계산 (원점수 기준, 유형 이름은 사용하지 않음)" }),
      el("ul", { class: "detail-list" }, axisRows),
      group.notes.length ? el("ul", { class: "rec-notes" }, group.notes.map((t) => el("li", { text: `참고: ${t}` }))) : null,
      el("p", { class: "admin-hint", text: "가중치와 목표 차이(30)는 과학적 궁합값이 아니라 운영진이 정한 교육용 추천 규칙이에요. 최종 확정은 운영진이 합니다." }),
    ],
    actions: [{ label: "닫기", variant: "secondary", close: true }],
  });
}

/* ---------- 16-9. 참가 상태 관리 ---------- */

/** 상태 변경 전 영향 확인 → { blocked, message } 또는 { needsConfirm, title, lines, dissolve } */
function planStatusChange(participant, newStatus) {
  const match = participant.matchId ? getMatch(participant.matchId) : null;
  const { min } = getGroupSizeLimits();
  const name = displayName(participant);

  if (MATCHED_STATUSES.includes(newStatus) && !participant.matchId) {
    return { blocked: true, message: ERROR_MESSAGES.STATUS_NEEDS_MATCH };
  }
  if ((newStatus === "waiting" || newStatus === "cancelled") && match) {
    const team = `STUDY TEAM #${formatTeamCode(match.teamCode)}`;
    const remaining = match.memberIds.length - 1;
    if (remaining < min) {
      return {
        needsConfirm: true,
        dissolve: true,
        title: "팀을 계속 진행할 수 없어요",
        confirmLabel: "팀 해체 후 변경",
        lines: [
          `${name} 학생을 '${STATUS_LABELS[newStatus]}'(으)로 바꾸면 ${team}에 ${remaining}명만 남습니다.`,
          `${min}명 미만 팀은 진행할 수 없어 팀이 해체되고, 남은 학생은 '매칭 대기'로 돌아갑니다. (${match.timeSlot || "-"} 타임은 비게 됩니다)`,
          "다른 학생은 자동으로 추가되지 않습니다. 해체 후 남은 학생을 직접 다시 매칭해주세요.",
        ],
      };
    }
    return {
      needsConfirm: true,
      title: newStatus === "cancelled" ? "매칭 완료된 학생을 취소할까요?" : "팀에서 제외할까요?",
      confirmLabel: newStatus === "cancelled" ? "취소 처리" : "변경",
      lines: [
        `${name} 학생이 ${team}에서 빠집니다.`,
        `팀은 ${match.memberIds.length}명 → ${remaining}명으로 계속 진행됩니다.`,
        "다른 학생은 자동으로 추가되지 않습니다.",
      ],
    };
  }
  if (newStatus === "cancelled") {
    return { needsConfirm: true, title: "참가 신청을 취소 처리할까요?", confirmLabel: "취소 처리", lines: [`${name} 학생의 신청을 취소 처리합니다. 취소된 학생은 새 확인코드로 다시 신청할 수 있어요.`] };
  }
  if (newStatus === "no_show" && match) {
    return { needsConfirm: true, title: "노쇼로 기록할까요?", confirmLabel: "노쇼로 기록", lines: [`${name} 학생을 노쇼로 기록합니다. 팀 구성과 타임은 그대로 유지됩니다.`] };
  }
  return { needsConfirm: false };
}

function onStatusSelectChange(select) {
  const participant = getParticipant(select.dataset.statusId);
  if (!participant) return;
  const newStatus = select.value;
  select.value = participant.status; // 서버 반영 전까지는 원래 값 유지
  if (newStatus === participant.status) return;

  const plan = planStatusChange(participant, newStatus);
  if (plan.blocked) {
    showToast(plan.message, 4500);
    return;
  }
  if (!plan.needsConfirm) {
    runAdminTask(select, null, () => updateParticipantStatus(participant.id, newStatus, false));
    return;
  }
  openAdminModal({
    title: plan.title,
    body: plan.lines.map((line) => el("p", { text: line })),
    actions: [
      { label: "취소", variant: "secondary", close: true },
      {
        label: plan.confirmLabel,
        variant: plan.dissolve || newStatus === "cancelled" ? "danger" : "primary",
        loadingText: "변경 중...",
        onClick: () => updateParticipantStatus(participant.id, newStatus, !!plan.dissolve),
      },
    ],
  });
}

async function updateParticipantStatus(participantId, newStatus, allowDissolve) {
  const result = await DataService.adminUpdateParticipantStatus(participantId, newStatus, allowDissolve);
  const label = STATUS_LABELS[newStatus];
  showToast(result && result.matchDissolved
    ? `'${label}'(으)로 변경하고 STUDY TEAM #${formatTeamCode(result.teamCode)}을(를) 해체했어요.`
    : `'${label}'(으)로 변경했어요.`);
  await refreshAdminDashboard({ silent: true });
}

/** 참가자 상세 팝업 (전체 전화번호는 버튼을 눌렀을 때만 서버에서 받아 표시) */
function openParticipantModal(participantId) {
  const p = getParticipant(participantId);
  if (!p) return;
  const match = p.matchId ? getMatch(p.matchId) : null;
  const type = getProfileType(p.profileType);
  const phoneValue = el("span", { text: p.phoneMasked || "-" });
  const phoneButton = el("button", { type: "button", class: "btn btn-ghost btn-xs", text: "전화번호 확인" });
  phoneButton.addEventListener("click", () => {
    runAdminTask(phoneButton, "불러오는 중...", async () => {
      const contact = await DataService.adminGetParticipantContact(p.id);
      phoneValue.textContent = formatPhone(onlyDigits(contact.phone || ""));
      phoneButton.remove();
    });
  });

  openAdminModal({
    title: "참가자 상세",
    body: [
      el("dl", { class: "info-list" }, [
        infoRow("이름", p.name),
        infoRow("학번", p.studentNumber),
        infoRow("학년 / 성별", `${optionLabel(CONFIG.gradeOptions, p.grade)} / ${optionLabel(CONFIG.genderOptions, p.gender)}`),
        infoRow("희망 조건", `${PREFERENCE_TEXT.gender[p.preferredGender] || "-"} · ${PREFERENCE_TEXT.grade[p.preferredGrade] || "-"}`),
        infoRow("연락처", [phoneValue, " ", phoneButton]),
        infoRow("STUDY TYPE", `${type.emoji} ${type.name}`),
        infoRow("STUDY BALANCE", formatProfileScores(p)),
        infoRow("확인코드", p.confirmationCode),
        infoRow("상태", STATUS_LABELS[p.status] || p.status),
        infoRow("팀 / 타임", match ? `#${formatTeamCode(match.teamCode)} / ${match.timeSlot || "-"}` : "-"),
        infoRow("신청시간", formatDateTimeShort(p.createdAt)),
      ]),
      el("p", { class: "admin-hint", text: "연락처는 긴급 연락 목적으로만 사용하세요. 팝업을 닫으면 화면에서 지워집니다." }),
    ],
    actions: [{ label: "닫기", variant: "secondary", close: true }],
  });
}

/** "자기탐색 72 · 숙고 81 · 협력학습 64 · 도전 자극도 75" (저장값이 없으면 '(기본값)') */
function formatProfileScores(participant) {
  const parts = AXIS_KEYS.map((axis) => {
    const label = SCORING_RULES.axes[axis].high.label;
    return `${label} ${Math.round(axisScore(participant, axis))}${hasAxisScore(participant, axis) ? "" : "(기본값)"}`;
  });
  parts.push(`${SCORING_RULES.challenge.title} ${Math.round(axisScore(participant, "challengeStimulus"))}${hasAxisScore(participant, "challengeStimulus") ? "" : "(기본값)"}`);
  return parts.join(" · ");
}

function formatProfileSummary(participant) {
  const type = getProfileType(participant.profileType);
  return `${type.emoji} ${type.name} (${AXIS_KEYS.map((axis) => Math.round(axisScore(participant, axis))).join("/")})`;
}

/** 참가자 표의 STUDY TYPE 클릭 → STUDY PROFILE 팝업 (유형 + 세 축 + 도전 자극도) */
function openProfileModal(participantId) {
  const p = getParticipant(participantId);
  if (!p) return;
  const type = getProfileType(p.profileType);
  const bar = (label, score, band) => el("div", { class: "profile-row" }, [
    el("div", { class: "score-head" }, [
      el("span", { class: "score-label", text: label }),
      el("span", { class: "score-value", text: `${score}${band === "balanced" ? " · 균형" : ""}` }),
    ]),
    el("div", { class: "score-track", "aria-hidden": "true" }, el("div", { class: "score-fill", style: `width:${score}%` })),
  ]);

  openAdminModal({
    title: `${displayName(p)} · STUDY PROFILE`,
    body: [
      el("p", { class: "profile-type" }, [el("span", { "aria-hidden": "true", text: `${type.emoji} ` }), el("strong", { text: type.name })]),
      el("p", { class: "profile-scores", text: formatProfileScores(p) }),
      ...AXIS_KEYS.map((axis) => {
        const score = Math.round(axisScore(p, axis));
        const info = SCORING_RULES.axes[axis];
        return bar(`${info.title} (${info.low.label} ↔ ${info.high.label})`, score, axisBand(score));
      }),
      bar(`${SCORING_RULES.challenge.emoji} ${SCORING_RULES.challenge.title} (매칭 점수에는 미포함)`, Math.round(axisScore(p, "challengeStimulus")), null),
      el("p", { class: "admin-hint", text: "점수는 0~100이며 오른쪽 성향 쪽일수록 높아요. 45~55는 균형 영역이에요. 진단 결과가 아닌 교육용 설문 결과입니다." }),
    ],
    actions: [
      { label: "참가자 상세", variant: "secondary", onClick: () => { openParticipantModal(p.id); return true; } },
      { label: "닫기", variant: "secondary", close: true },
    ],
  });
}

/* ---------- 16-10. 운영 설정 ---------- */
async function handleApplicationsToggle(event) {
  const toggle = event.target;
  const open = toggle.checked;
  if (state.admin.busy) {
    toggle.checked = !open;
    return;
  }
  state.admin.busy = true;
  toggle.disabled = true;
  try {
    await DataService.adminToggleApplications(open);
    showToast(open ? "STUDY MATE 신청을 다시 받습니다." : "STUDY MATE 신청을 마감했습니다.");
  } catch (error) {
    toggle.checked = !open;
    handleAdminActionError(error);
  } finally {
    state.admin.busy = false;
    toggle.disabled = false;
  }
  refreshAdminDashboard({ silent: true });
}

async function handleMaxParticipantsSubmit(event) {
  event.preventDefault();
  const input = $("#admin-max-input");
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    showToast("정원은 1~1000 사이의 숫자로 입력해주세요.");
    return;
  }
  const button = event.target.querySelector("button[type=submit]");
  const ok = await runAdminTask(button, "저장 중...", () => DataService.adminSetMaxParticipants(value));
  if (ok) {
    showToast(`정원을 ${value}명으로 변경했어요.`);
    input.blur();
    refreshAdminDashboard({ silent: true });
  }
}

/* ---------- 16-11. 자동 새로고침 ---------- */
function startAdminAutoRefresh() {
  stopAdminAutoRefresh();
  const seconds = Number(CONFIG.adminAutoRefreshSeconds);
  if (!(seconds > 0)) return;
  state.admin.autoRefreshTimer = setInterval(() => {
    if (!shouldSkipAutoRefresh()) refreshAdminDashboard({ silent: true });
  }, seconds * 1000);
}

function stopAdminAutoRefresh() {
  clearInterval(state.admin.autoRefreshTimer);
  state.admin.autoRefreshTimer = null;
}

/** 운영진 작업을 방해하지 않도록 자동 새로고침을 건너뛰는 조건 */
function shouldSkipAutoRefresh() {
  const admin = state.admin;
  if (!admin.session || state.currentView !== "admin") return true;
  if (document.hidden || admin.busy || admin.isLoading) return true;
  if (isAdminModalOpen() || admin.selected.size > 0) return true;
  const active = document.activeElement;
  return !!(active && active.closest && active.closest("#admin-table, #admin-max-form"));
}

/* ---------- 16-12. 버튼 동작 ---------- */
function onRecommendationConfirm(button) {
  const group = state.admin.recommendations[Number(button.dataset.recIndex)];
  if (group) openConfirmMatchModal(group.memberIds);
}

function onManualConfirm() {
  if (state.admin.selected.size) openConfirmMatchModal(Array.from(state.admin.selected));
}

function onManualClear() {
  state.admin.selected.clear();
  renderManualPanel();
  renderParticipantTable();
}

function onRecompute() {
  if (!state.admin.data) return;
  updateRecommendations(true);
  renderRecommendations();
  showToast("추천 조합을 다시 계산했어요.");
}

function onAdminSort(button) {
  state.admin.sortDesc = !state.admin.sortDesc;
  button.textContent = state.admin.sortDesc ? "신청시간 ↓" : "신청시간 ↑";
  if (state.admin.data) renderParticipantTable();
}


/* =====================================================================
   17. 행사 종료 데이터 삭제
   ---------------------------------------------------------------------
   1차 확인 → 2차로 '삭제' 입력 → 서버 함수(sm_admin_delete_event_data)가 관리자 재확인 후 삭제
   참가자·매칭 데이터만 삭제하고 운영 설정(정원/신청 ON·OFF)은 유지합니다.
   ===================================================================== */
function requestEventDataDeletion() {
  if (!state.admin.data) return;
  const { participants, matches } = state.admin.data;
  openAdminModal({
    title: "정말 삭제하시겠습니까?",
    body: [
      el("p", { text: "모든 참가자의 이름·학번·전화번호·설문 결과와 매칭(팀·타임) 데이터가 삭제됩니다." }),
      el("p", { class: "danger-text", text: `삭제 대상: 참가자 ${participants.length}명 · 팀 ${matches.length}개 · 되돌릴 수 없습니다.` }),
      el("p", { class: "admin-hint", text: "운영 설정(정원·신청 ON/OFF)은 유지됩니다." }),
    ],
    actions: [
      { label: "취소", variant: "secondary", close: true },
      { label: "계속", variant: "danger", onClick: () => { openDeletionFinalStep(); return true; } },
    ],
  });
}

function openDeletionFinalStep() {
  const input = el("input", { type: "text", id: "delete-confirm-input", class: "input", autocomplete: "off", "aria-describedby": "delete-confirm-help" });
  openAdminModal({
    title: "마지막 확인",
    body: [
      el("p", { id: "delete-confirm-help", text: "확인을 위해 아래 칸에 삭제 라고 입력하세요." }),
      el("div", { class: "field" }, [el("label", { for: "delete-confirm-input", text: "확인 문구" }), input]),
    ],
    actions: [
      { label: "취소", variant: "secondary", close: true },
      {
        id: "btn-delete-final",
        label: "개인정보 및 매칭 데이터 전체 삭제",
        variant: "danger",
        disabled: true,
        loadingText: "삭제 중...",
        onClick: async () => {
          await DataService.adminDeleteEventData(input.value.trim());
          state.admin.selected.clear();
          showToast("행사 데이터가 모두 삭제되었습니다.", 4000);
          await refreshAdminDashboard({ silent: true });
        },
      },
    ],
  });
  input.addEventListener("input", () => {
    $("#btn-delete-final").disabled = input.value.trim() !== "삭제";
  });
  input.focus();
}


/* =====================================================================
   18. 데이터 서비스
   ---------------------------------------------------------------------
   화면 코드는 DataService.xxx() 만 호출합니다.
   → MOCK ↔ Supabase 전환 시 화면 코드를 고칠 필요가 없습니다.
   MOCK 은 supabase/setup.sql 의 서버 함수와 같은 규칙(검증·오류 코드)으로 동작합니다.
   ===================================================================== */

/* ---------- 18-1. MOCK (브라우저 메모리 전용, 저장소 사용 안 함) ---------- */
const MOCK_DB = {
  settings: { applicationsOpen: true, maxParticipants: CONFIG.maxParticipants },
  participants: [],
  matches: [],
};

function mockActiveCount() {
  return MOCK_DB.participants.filter((p) => p.status !== "cancelled").length;
}
function mockUsedSlotCount() {
  return MOCK_DB.matches.filter((m) => m.timeSlot && m.status !== "cancelled").length;
}
/** sm_submit_application 의 타임 마감 규칙: 빈 타임이 없거나, 남은 타임에 앉을 수 있는 인원보다 대기자가 많으면 마감 */
function mockSlotsFull(extraApplicants = 0) {
  const freeSlots = CONFIG.timeSlots.length - mockUsedSlotCount();
  if (freeSlots <= 0) return true;
  const waiting = MOCK_DB.participants.filter((p) => p.status === "waiting").length;
  return waiting + extraApplicants > freeSlots * CONFIG.maxGroupSize;
}
function mockClone(value) { return JSON.parse(JSON.stringify(value)); }

/** sm_submit_application 과 같은 STUDY PROFILE 검증: 0~100 정수 + 버전 + 점수로 다시 계산한 유형과 일치 */
function isValidStudyProfileRecord(record, profileType) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  if (record.version !== CONFIG.studyProfileVersion) return false;
  const keys = ["explorationScore", "reflectionScore", "relationshipScore", "challengeStimulus"];
  if (!keys.every((key) => Number.isInteger(record[key]) && record[key] >= 0 && record[key] <= 100)) return false;
  const expected = determineProfileType({
    exploration: record.explorationScore,
    reflection: record.reflectionScore,
    relationship: record.relationshipScore,
  }).id;
  return record.profileType === expected && profileType === expected;
}

/** sm_submit_application 과 같은 입력 검증 */
function mockValidatePayload(payload) {
  const p = payload || {};
  const studentNumber = String(p.studentNumber || "").trim();
  const name = String(p.name || "").trim();
  const phone = onlyDigits(String(p.phone || ""));
  const valid = /^[0-9]{4,10}$/.test(studentNumber)
    && name.length >= 2 && name.length <= 20
    && /^01[016789][0-9]{7,8}$/.test(phone)
    && ["male", "female"].includes(p.gender)
    && /^[1-3]$/.test(String(p.grade))
    && ["same", "opposite", "any"].includes(p.preferredGender)
    && ["same", "different", "any"].includes(p.preferredGrade)
    && isValidStudyProfileRecord(p.studyProfile, p.profileType);
  if (!valid) throw new AppError("INVALID");
  return { studentNumber, name, phone };
}

const MockDataService = {
  async getApplicationStatus() {
    await delay(250);
    const active = mockActiveCount();
    const max = MOCK_DB.settings.maxParticipants;
    return {
      enabled: MOCK_DB.settings.applicationsOpen && CONFIG.studyMateApplicationEnabled,
      currentApplicants: active,
      maxParticipants: max,
      remainingCapacity: Math.max(max - active, 0),
      isFull: active >= max,
      slotsFull: mockSlotsFull(1),
    };
  },

  async submitApplication(payload) {
    await delay(600);
    const clean = mockValidatePayload(payload);
    if (!MOCK_DB.settings.applicationsOpen) throw new AppError("APPLICATION_CLOSED");
    if (mockActiveCount() >= MOCK_DB.settings.maxParticipants) throw new AppError("FULL");
    if (mockSlotsFull(1)) throw new AppError("SLOTS_FULL");
    if (MOCK_DB.participants.some((p) => p.studentNumber === clean.studentNumber && p.status !== "cancelled")) {
      throw new AppError("DUPLICATE");
    }

    const confirmationCode = generateConfirmationCode(new Set(MOCK_DB.participants.map((p) => p.confirmationCode)));
    const now = new Date().toISOString();
    MOCK_DB.participants.push({
      id: createId(),
      profileId: payload.profileId || null,
      studentNumber: clean.studentNumber,
      name: clean.name,
      phone: clean.phone,
      gender: payload.gender,
      grade: Number(payload.grade),
      preferredGender: payload.preferredGender,
      preferredGrade: payload.preferredGrade,
      studyProfile: toStudyProfileRecord(payload.studyProfile),
      profileType: payload.profileType,
      confirmationCode,
      status: "waiting",
      matchId: null,
      createdAt: now,
      updatedAt: now,
    });
    return { success: true, confirmationCode };
  },

  async lookupByCode(code) {
    await delay(400);
    const normalized = normalizeConfirmationCode(code);
    const participant = MOCK_DB.participants.find((p) => p.confirmationCode === normalized);
    if (!participant) throw new AppError("NOT_FOUND");
    const match = MOCK_DB.matches.find((m) => m.id === participant.matchId && m.status !== "cancelled");
    // 학생에게 돌려주는 정보는 여기까지만 (상대 정보 없음)
    return {
      status: participant.status,
      teamCode: match ? match.teamCode : null,
      compatibilityScore: match && match.compatibilityScore !== null ? Math.round(match.compatibilityScore) : null,
      timeSlot: match ? findTimeSlot(match.timeSlot) : null,
    };
  },

  // ---- 관리자 (MOCK: 로그인 상태를 서버의 관리자 확인처럼 검사) ----
  requireAdmin() {
    if (!state.admin.session || state.admin.session.mode !== "mock") throw new AppError("NOT_ADMIN");
  },

  async adminSignIn(password) {
    await delay(400);
    if (String(password).length < 4) throw new AppError("ADMIN_AUTH_FAILED");
    return { mode: "mock" };
  },

  async adminRestoreSession() { return null; },
  async adminSignOut() {},

  async adminGetDashboard() {
    await delay(200);
    this.requireAdmin();
    return mockClone({
      settings: {
        ...MOCK_DB.settings,
        minGroupSize: CONFIG.minGroupSize,
        maxGroupSize: CONFIG.maxGroupSize,
        timeSlotIds: CONFIG.timeSlots.map((s) => s.id),
      },
      participants: MOCK_DB.participants.map(({ phone, ...rest }) => ({ ...rest, phoneMasked: maskPhone(phone) })),
      matches: MOCK_DB.matches,
    });
  },

  async adminGetParticipantContact(participantId) {
    await delay(200);
    this.requireAdmin();
    const p = MOCK_DB.participants.find((x) => x.id === participantId);
    if (!p) throw new AppError("MEMBER_NOT_FOUND");
    return { phone: p.phone };
  },

  async adminCreateMatch({ memberIds, timeSlot, compatibilityScore, compatibilityReason }) {
    await delay(500);
    this.requireAdmin();
    const ids = Array.from(new Set(memberIds || []));
    if (ids.length !== (memberIds || []).length) throw new AppError("DUPLICATE_MEMBER");
    if (ids.length < CONFIG.minGroupSize || ids.length > CONFIG.maxGroupSize) throw new AppError("GROUP_SIZE");
    if (!CONFIG.timeSlots.some((s) => s.id === timeSlot)) throw new AppError("SLOT_INVALID");

    const members = ids.map((id) => MOCK_DB.participants.find((p) => p.id === id));
    if (members.some((m) => !m)) throw new AppError("MEMBER_NOT_FOUND");
    if (members.some((m) => m.status !== "waiting" || m.matchId)) throw new AppError("MEMBER_NOT_WAITING");
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        if (!checkHardFilter(members[i], members[j]).ok) throw new AppError("HARD_FILTER");
      }
    }
    if (MOCK_DB.matches.some((m) => m.timeSlot === timeSlot)) throw new AppError("SLOT_TAKEN");

    const teamNumber = MOCK_DB.matches.reduce((max, m) => Math.max(max, m.teamNumber || 0), 0) + 1;
    const now = new Date().toISOString();
    const match = {
      id: createId(),
      teamNumber,
      teamCode: `ST-${pad2(teamNumber)}`,
      memberIds: ids,
      compatibilityScore: compatibilityScore === null || compatibilityScore === undefined ? null : clamp(Number(compatibilityScore), 0, 100),
      compatibilityReason: compatibilityReason ? mockClone(compatibilityReason) : [],
      timeSlot,
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    };
    MOCK_DB.matches.push(match);
    members.forEach((m) => { m.status = "matched"; m.matchId = match.id; m.updatedAt = now; });
    return { matchId: match.id, teamCode: match.teamCode, timeSlot };
  },

  async adminUpdateParticipantStatus(participantId, newStatus, allowDissolve = false) {
    await delay(350);
    this.requireAdmin();
    if (!STATUS_ORDER.includes(newStatus)) throw new AppError("INVALID_STATUS");
    const p = MOCK_DB.participants.find((x) => x.id === participantId);
    if (!p) throw new AppError("MEMBER_NOT_FOUND");
    if (p.status === newStatus) return { status: p.status, matchDissolved: false, teamCode: null };
    if (MATCHED_STATUSES.includes(newStatus) && !p.matchId) throw new AppError("STATUS_NEEDS_MATCH");
    // 취소 → 다른 상태로 복구할 때 같은 학번의 활성 신청이 있으면 거절 (DB 부분 UNIQUE 와 동일)
    if (p.status === "cancelled" && newStatus !== "cancelled"
      && MOCK_DB.participants.some((x) => x.id !== p.id && x.studentNumber === p.studentNumber && x.status !== "cancelled")) {
      throw new AppError("DUPLICATE");
    }

    const now = new Date().toISOString();
    if ((newStatus === "waiting" || newStatus === "cancelled") && p.matchId) {
      const match = MOCK_DB.matches.find((m) => m.id === p.matchId);
      const remaining = match.memberIds.filter((id) => id !== p.id);
      const teamCode = match.teamCode;
      if (remaining.length < CONFIG.minGroupSize) {
        if (!allowDissolve) throw new AppError("GROUP_TOO_SMALL");
        Object.assign(p, { status: newStatus, matchId: null, updatedAt: now });
        MOCK_DB.participants.filter((x) => x.matchId === match.id).forEach((x) => {
          Object.assign(x, { matchId: null, status: x.status === "no_show" ? "no_show" : "waiting", updatedAt: now });
        });
        Object.assign(match, { status: "cancelled", timeSlot: null, memberIds: remaining, updatedAt: now });
        return { status: newStatus, matchDissolved: true, teamCode };
      }
      Object.assign(p, { status: newStatus, matchId: null, updatedAt: now });
      Object.assign(match, { memberIds: remaining, updatedAt: now });
      return { status: newStatus, matchDissolved: false, teamCode };
    }
    Object.assign(p, { status: newStatus, updatedAt: now });
    return { status: newStatus, matchDissolved: false, teamCode: null };
  },

  async adminAssignTimeSlot(matchId, timeSlot) {
    await delay(300);
    this.requireAdmin();
    if (!CONFIG.timeSlots.some((s) => s.id === timeSlot)) throw new AppError("SLOT_INVALID");
    const match = MOCK_DB.matches.find((m) => m.id === matchId);
    if (!match || match.status === "cancelled") throw new AppError("MATCH_NOT_FOUND");
    if (MOCK_DB.matches.some((m) => m.timeSlot === timeSlot && m.id !== matchId)) throw new AppError("SLOT_TAKEN");
    Object.assign(match, { timeSlot, updatedAt: new Date().toISOString() });
    return { matchId, timeSlot };
  },

  async adminDissolveMatch(matchId) {
    await delay(300);
    this.requireAdmin();
    const match = MOCK_DB.matches.find((m) => m.id === matchId);
    if (!match || match.status === "cancelled") throw new AppError("MATCH_NOT_FOUND");
    const members = MOCK_DB.participants.filter((p) => p.matchId === matchId);
    if (members.some((p) => p.status === "completed")) throw new AppError("MATCH_COMPLETED");
    const now = new Date().toISOString();
    members.forEach((p) => Object.assign(p, { matchId: null, status: p.status === "no_show" ? "no_show" : "waiting", updatedAt: now }));
    Object.assign(match, { status: "cancelled", timeSlot: null, updatedAt: now });
    return { matchId, releasedMembers: members.length };
  },

  async adminToggleApplications(open) {
    await delay(250);
    this.requireAdmin();
    if (typeof open !== "boolean") throw new AppError("INVALID");
    MOCK_DB.settings.applicationsOpen = open;
    return { applicationsOpen: open };
  },

  async adminSetMaxParticipants(max) {
    await delay(250);
    this.requireAdmin();
    if (!Number.isInteger(max) || max < 1 || max > 1000) throw new AppError("INVALID");
    MOCK_DB.settings.maxParticipants = max;
    return { maxParticipants: max };
  },

  async adminDeleteEventData(confirmText) {
    await delay(500);
    this.requireAdmin();
    if (confirmText !== "삭제") throw new AppError("CONFIRM_REQUIRED");
    const result = { deletedParticipants: MOCK_DB.participants.length, deletedMatches: MOCK_DB.matches.length };
    MOCK_DB.participants.length = 0;
    MOCK_DB.matches.length = 0;
    return result;
  },

  /** [개발용] 무작위 대기 참가자 추가 (정원·학번 중복 규칙 준수) */
  devSeedParticipants(count) {
    this.requireAdmin();
    const surnames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오"];
    const givens = ["민준", "서연", "도윤", "하은", "시우", "지유", "예준", "서윤", "주원", "지민", "하준", "수아", "유진", "현우"];
    const pickWeighted = (pairs) => {
      let r = secureRandomInt(100);
      for (const [value, weight] of pairs) { if ((r -= weight) < 0) return value; }
      return pairs[0][0];
    };
    let added = 0;
    for (let i = 0; i < count; i += 1) {
      if (mockActiveCount() >= MOCK_DB.settings.maxParticipants) break;
      let studentNumber;
      do {
        studentNumber = `${1 + secureRandomInt(3)}${pad2(1 + secureRandomInt(9))}${pad2(1 + secureRandomInt(30))}`;
      } while (MOCK_DB.participants.some((p) => p.studentNumber === studentNumber && p.status !== "cancelled"));
      const studyProfile = createSampleStudyProfile(MOCK_DB.participants.length);
      const now = new Date(Date.now() - secureRandomInt(3600) * 1000).toISOString();
      MOCK_DB.participants.push({
        id: createId(),
        profileId: createId(),
        studentNumber,
        name: `${surnames[secureRandomInt(surnames.length)]}${givens[secureRandomInt(givens.length)]}`,
        phone: `010${String(secureRandomInt(100000000)).padStart(8, "0")}`,
        gender: secureRandomInt(2) ? "male" : "female",
        grade: Number(studentNumber[0]),
        preferredGender: pickWeighted([["any", 50], ["same", 30], ["opposite", 20]]),
        preferredGrade: pickWeighted([["any", 50], ["same", 30], ["different", 20]]),
        studyProfile,
        profileType: studyProfile.profileType,
        confirmationCode: generateConfirmationCode(new Set(MOCK_DB.participants.map((p) => p.confirmationCode))),
        status: "waiting",
        matchId: null,
        createdAt: now,
        updatedAt: now,
      });
      added += 1;
    }
    return added;
  },
};

/* ---------- 18-2. Supabase ----------
   - 학생: REST 로 학생용 RPC 3개만 호출 (테이블 직접 조회 없음, 라이브러리 불필요)
   - 관리자: 공식 supabase-js 로 로그인 → 관리자 RPC 호출 (서버가 관리자 이메일 재확인)
   서버 오류 메시지의 "SM_XXX" 코드를 ERROR_MESSAGES 의 친절한 문구로 바꿉니다.
------------------------------------------------------------------------ */
let supabaseClient = null;
let supabaseSdkPromise = null;

/** supabase-js (버전 고정 CDN) 를 관리자 기능에서만 불러옴 */
function loadSupabaseSdk() {
  if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve();
  if (!supabaseSdkPromise) {
    supabaseSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SUPABASE_CONFIG.sdkUrl;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.onload = () => {
        if (window.supabase && typeof window.supabase.createClient === "function") resolve();
        else reject(new AppError("SDK_LOAD_FAILED"));
      };
      script.onerror = () => {
        supabaseSdkPromise = null;
        script.remove();
        reject(new AppError("SDK_LOAD_FAILED"));
      };
      document.head.append(script);
    });
  }
  return supabaseSdkPromise;
}

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  await withTimeout(loadSupabaseSdk(), SUPABASE_CONFIG.requestTimeoutMs);
  // 세션(토큰)은 sessionStorage 에만 보관 → 탭을 닫으면 사라짐. 비밀번호는 어디에도 저장하지 않음
  supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
      storage: window.sessionStorage,
      storageKey: SUPABASE_CONFIG.authStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return supabaseClient;
}

function hasStoredAdminSession() {
  try {
    return !!window.sessionStorage.getItem(SUPABASE_CONFIG.authStorageKey);
  } catch (error) {
    return false;
  }
}

/** 서버 오류 → AppError (원본 메시지는 화면/콘솔에 내보내지 않음) */
function mapServerError(error, httpStatus, { forStudent = false } = {}) {
  const text = [error && error.message, error && error.hint, error && error.details].filter(Boolean).join(" ");
  const smCode = text.match(/SM_([A-Z_]+)/);
  let code = "SERVER";
  if (smCode) {
    const mapped = SERVER_ERROR_ALIASES[smCode[1]] || smCode[1];
    code = ERROR_MESSAGES[mapped] ? mapped : "SERVER";
  } else if ((error && ["PGRST301", "PGRST302", "PGRST303"].includes(error.code)) || /jwt/i.test(text) || httpStatus === 401) {
    code = "AUTH_EXPIRED";
  } else if ((error && error.code === "42501") || httpStatus === 403) {
    code = "NOT_ADMIN";
  }
  if (forStudent && (code === "AUTH_EXPIRED" || code === "NOT_ADMIN")) code = "SERVER";
  return new AppError(code);
}

const SupabaseDataService = {
  /** 학생용 RPC (REST) */
  async restRpc(functionName, params = {}) {
    const key = SUPABASE_CONFIG.anonKey;
    const headers = { apikey: key, "Content-Type": "application/json" };
    // 기존 JWT 형식 anon key 만 Authorization 헤더에도 넣음 (새 publishable key 는 apikey 헤더만 사용)
    if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

    let response;
    try {
      response = await withTimeout(
        fetch(`${SUPABASE_CONFIG.url}/rest/v1/rpc/${functionName}`, { method: "POST", headers, body: JSON.stringify(params) }),
        SUPABASE_CONFIG.requestTimeoutMs
      );
    } catch (error) {
      throw error instanceof AppError ? error : new AppError("NETWORK");
    }

    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (!response.ok) throw mapServerError(data, response.status, { forStudent: true });
    return data;
  },

  async getApplicationStatus() {
    const d = await this.restRpc(SUPABASE_CONFIG.rpc.applicationStatus);
    if (!d) throw new AppError("SERVER");
    return {
      enabled: d.applicationsOpen === true && CONFIG.studyMateApplicationEnabled,
      currentApplicants: d.currentApplicants,
      maxParticipants: d.maxParticipants,
      remainingCapacity: d.remainingCapacity,
      isFull: Number(d.remainingCapacity) <= 0,
      slotsFull: typeof d.slotsFull === "boolean" ? d.slotsFull : d.remainingTimeSlots === 0,
    };
  },

  async submitApplication(payload) {
    const d = await this.restRpc(SUPABASE_CONFIG.rpc.submitApplication, { p_payload: payload });
    if (!d || d.success !== true || !d.confirmationCode) throw new AppError("SAVE_FAILED");
    return { success: true, confirmationCode: d.confirmationCode };
  },

  async lookupByCode(code) {
    const d = await this.restRpc(SUPABASE_CONFIG.rpc.lookupByCode, { p_code: code });
    if (!d || d.found !== true) throw new AppError("NOT_FOUND");
    return {
      status: d.status,
      teamCode: d.teamCode || null,
      compatibilityScore: d.compatibilityScore === null || d.compatibilityScore === undefined ? null : Math.round(d.compatibilityScore),
      timeSlot: findTimeSlot(d.timeSlot),
      message: d.message || "",
    };
  },

  /** 관리자 RPC (로그인한 관리자 토큰으로 호출) */
  async adminRpc(functionName, params = {}) {
    const client = await getSupabaseClient();
    let result;
    try {
      result = await withTimeout(client.rpc(functionName, params), SUPABASE_CONFIG.requestTimeoutMs);
    } catch (error) {
      throw error instanceof AppError ? error : new AppError("NETWORK");
    }
    if (result.error) throw mapServerError(result.error, result.status);
    return result.data;
  },

  async adminSignIn(password) {
    if (!SUPABASE_CONFIG.adminEmail) throw new AppError("ADMIN_NOT_CONFIGURED");
    const client = await getSupabaseClient();
    let result;
    try {
      result = await withTimeout(
        client.auth.signInWithPassword({ email: SUPABASE_CONFIG.adminEmail, password }),
        SUPABASE_CONFIG.requestTimeoutMs
      );
    } catch (error) {
      throw error instanceof AppError ? error : new AppError("NETWORK");
    }
    if (result.error) {
      const retryable = result.error.name === "AuthRetryableFetchError" || result.error.status === 0;
      throw new AppError(retryable ? "NETWORK" : "ADMIN_AUTH_FAILED");
    }
    // 로그인에 성공해도 '지정된 관리자 계정'이 아니면 즉시 로그아웃
    const isAdmin = await this.adminRpc(SUPABASE_CONFIG.rpc.isAdmin).catch(() => false);
    if (isAdmin !== true) {
      await client.auth.signOut().catch(() => {});
      throw new AppError("ADMIN_AUTH_FAILED");
    }
    return { mode: "supabase" };
  },

  /** 새로고침 후 공식 Supabase 세션 복원 (관리자 확인까지 통과해야 복원) */
  async adminRestoreSession() {
    if (!hasStoredAdminSession()) return null;
    const client = await getSupabaseClient();
    const { data } = await client.auth.getSession();
    if (!data || !data.session) return null;
    const isAdmin = await this.adminRpc(SUPABASE_CONFIG.rpc.isAdmin).catch(() => false);
    if (isAdmin !== true) {
      await client.auth.signOut().catch(() => {});
      return null;
    }
    return { mode: "supabase" };
  },

  async adminSignOut() {
    if (supabaseClient) await supabaseClient.auth.signOut().catch(() => {});
    try { window.sessionStorage.removeItem(SUPABASE_CONFIG.authStorageKey); } catch (e) { /* 무시 */ }
  },

  adminGetDashboard() {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminDashboard);
  },
  adminGetParticipantContact(participantId) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminContact, { p_participant_id: participantId });
  },
  adminCreateMatch({ memberIds, timeSlot, compatibilityScore, compatibilityReason }) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminCreateMatch, {
      p_member_ids: memberIds,
      p_time_slot: timeSlot,
      p_compatibility_score: compatibilityScore,
      p_compatibility_reason: compatibilityReason,
    });
  },
  adminUpdateParticipantStatus(participantId, newStatus, allowDissolve = false) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminUpdateStatus, {
      p_participant_id: participantId,
      p_new_status: newStatus,
      p_allow_dissolve: !!allowDissolve,
    });
  },
  adminAssignTimeSlot(matchId, timeSlot) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminAssignSlot, { p_match_id: matchId, p_time_slot: timeSlot });
  },
  adminDissolveMatch(matchId) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminDissolveMatch, { p_match_id: matchId });
  },
  adminToggleApplications(open) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminToggleApplications, { p_open: open });
  },
  adminSetMaxParticipants(max) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminSetMaxParticipants, { p_max: max });
  },
  adminDeleteEventData(confirmText) {
    return this.adminRpc(SUPABASE_CONFIG.rpc.adminDeleteEventData, { p_confirm: confirmText });
  },
};

/** CONFIG.dataMode 와 Supabase 설정 상태로 사용할 서비스 결정 */
function selectDataService() {
  if (CONFIG.dataMode === "supabase") {
    if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) return SupabaseDataService;
    console.warn("[STUDY MATE] Supabase 설정(url/anonKey)이 비어 있어 MOCK 모드로 실행합니다.");
  }
  return MockDataService;
}

/* ---------- 18-3. 개발용 도구 (MOCK 모드 전용) ---------- */

/**
 * [개발용] typeIndex 번째 유형(PROFILE_TYPES 순서, 8개 순환)에 해당하는 가짜 STUDY PROFILE
 * - 높은 축 56~95 / 낮은 축 5~44, 가끔 한 축은 균형 영역(45~55) → 같은 유형이라도 점수가 제각각
 */
function createSampleStudyProfile(typeIndex, random = secureRandomInt) {
  const type = PROFILE_TYPES[typeIndex % PROFILE_TYPES.length];
  const balancedAxis = random(4) === 0 ? AXIS_KEYS[random(AXIS_KEYS.length)] : null;
  const pick = (axis) => {
    const high = type.when[axis] === "high";
    if (axis === balancedAxis) return high ? 50 + random(6) : 45 + random(5);
    return high ? 56 + random(40) : 5 + random(40);
  };
  return buildStudyProfile({
    explorationScore: pick("exploration"),
    reflectionScore: pick("reflection"),
    relationshipScore: pick("relationship"),
    challengeStimulus: random(101),
  });
}

/** 항상 같은 순서의 의사난수 (알고리즘 테스트 재현용) */
function createSeededRandom(seed) {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (s >>> 8) % n;
  };
}
async function devSeedParticipants(button) {
  if (!isMockMode()) return;
  await runAdminTask(button, "생성 중...", async () => {
    const added = MockDataService.devSeedParticipants(12);
    showToast(added > 0 ? `개발용 참가자 ${added}명을 추가했어요.` : "정원이 가득 차서 추가하지 못했어요.");
    await refreshAdminDashboard({ silent: true });
  });
}

/** 추천 알고리즘 자체 점검: 설계된 12명 시나리오 + 44명 성능 측정 (MOCK_DB 는 건드리지 않음) */
function devRunAlgorithmTest() {
  if (!isMockMode()) return;
  const random = createSeededRandom(20261023);
  // [성별, 학년, 희망 성별, 희망 학년]
  const design = [
    ["female", 2, "same", "same"], ["female", 2, "same", "same"], ["female", 2, "same", "any"],
    ["male", 1, "any", "any"], ["male", 1, "any", "same"], ["male", 1, "same", "any"], ["male", 1, "any", "any"],
    ["female", 1, "any", "same"], ["female", 3, "any", "any"],
    ["female", 1, "opposite", "different"], // T10: 조건 만족 대기자 없음 (예상: 매칭 불가)
    ["male", 3, "same", "same"],            // T11: 조건 만족 대기자 없음 (예상: 매칭 불가)
    ["female", 3, "same", "different"],     // T12: T3 한 명만 가능 (예상: 제한적)
  ];
  const people = design.map(([gender, grade, preferredGender, preferredGrade], i) => {
    const studyProfile = createSampleStudyProfile(i, random);
    return { id: `T${i + 1}`, name: `테스트${pad2(i + 1)}`, gender, grade, preferredGender, preferredGrade, studyProfile, profileType: studyProfile.profileType, status: "waiting", matchId: null };
  });
  // 상태 필터 확인용: 매칭 완료/취소/노쇼 학생은 추천에 나오면 안 됨
  people.push({ ...people[3], id: "X1", status: "matched", matchId: "m1" });
  people.push({ ...people[3], id: "X2", status: "cancelled" });
  people.push({ ...people[3], id: "X3", status: "no_show" });

  const lines = [];
  const check = (ok, text) => { lines.push(`${ok ? "✓" : "✗"} ${text}`); return ok; };
  let allOk = true;

  const recs = generateRecommendedGroups(people);
  allOk &= check(recs.length > 0, `추천 조합 ${recs.length}개 생성`);
  allOk &= check(recs.every((g) => g.memberIds.every((a) => g.memberIds.every((b) => a === b || checkHardFilter(people.find((p) => p.id === a), people.find((p) => p.id === b)).ok))), "모든 추천이 양방향 HARD FILTER 통과");
  allOk &= check(recs.every((g) => !g.memberIds.some((id) => ["X1", "X2", "X3", "T10", "T11"].includes(id))), "매칭 완료·취소·노쇼·조건 불가 학생은 추천에서 제외");
  allOk &= check(recs.every((g) => Number.isInteger(g.score) && g.score >= 0 && g.score <= 100 && g.reasons.length >= 1 && g.reasons.length <= CONFIG.matching.maxReasons), `STUDY MATCH 0~100 정수, 추천 이유 1~${CONFIG.matching.maxReasons}개`);
  allOk &= check(recs.every((g) => g.reasons.concat(g.notes).every((t) => !/궁합|완벽|확률/.test(t))), "추천 이유에 단정 표현 없음");

  // 보완 점수는 차이 30 에서 최고점
  const compAt = (d) => Math.round(computeComplementScore(0, d, 30));
  allOk &= check(compAt(30) === 100 && compAt(0) < 100 && compAt(60) < 100 && compAt(100) === 0, `보완 점수 차이별: 0→${compAt(0)} 15→${compAt(15)} 30→${compAt(30)} 45→${compAt(45)} 60→${compAt(60)} 100→${compAt(100)}`);
  // 같은 유형이라도 점수가 다르면 STUDY MATCH 가 다름 / 유형 이름은 점수에 영향 없음
  const base = { gender: "female", grade: 2, preferredGender: "any", preferredGrade: "any", status: "waiting", matchId: null };
  const mk = (id, e, r, rel) => { const sp = buildStudyProfile({ explorationScore: e, reflectionScore: r, relationshipScore: rel, challengeStimulus: 50 }); return { ...base, id, studyProfile: sp, profileType: sp.profileType }; };
  const anchor = mk("A", 30, 30, 70);
  const sameType1 = mk("B1", 60, 60, 72);
  const sameType2 = mk("B2", 95, 95, 99);
  const s1 = computePairCompatibility(anchor, sameType1).score;
  const s2 = computePairCompatibility(anchor, sameType2).score;
  allOk &= check(sameType1.profileType === sameType2.profileType && s1 !== s2, `같은 유형(${getProfileType(sameType1.profileType).name}) 다른 점수 → STUDY MATCH ${s1} vs ${s2}`);
  const renamed = { ...sameType1, profileType: "careful_explorer", studyProfile: { ...sameType1.studyProfile, profileType: "careful_explorer" } };
  allOk &= check(computePairCompatibility(anchor, renamed).score === s1, "유형 이름을 바꿔도 점수 동일 (원점수만 사용)");
  allOk &= check(recs.some((g) => g.memberIds.length === 3), "3인 조합이 추천에 포함 (3 → 4 → 2 선호)");

  const hard = analyzeHardToMatch(people);
  const blocked = hard.filter((h) => h.level === "blocked").map((h) => h.participant.id).sort();
  allOk &= check(JSON.stringify(blocked) === JSON.stringify(["T10", "T11"]), `매칭 불가 감지: ${blocked.join(", ") || "없음"} (예상 T10, T11)`);
  hard.forEach((h) => lines.push(`   - ${h.participant.name}: ${h.reason}`));
  allOk &= check(hard.some((h) => h.participant.id === "T12" && h.level === "limited"), "제한적 참가자 감지: T12 (예상)");

  const sim = simulateGreedyAssignment(people);
  lines.push(`· 겹치지 않게 배정 시뮬레이션: ${sim.teams.length}팀 (${sim.teams.map((t) => t.memberIds.length).join("/")}명), 남는 대기자 ${sim.leftover.map((p) => p.id).join(", ") || "없음"}`);

  // 성능: 조건 '무관' 44명 (가장 조합이 많은 경우)
  const stress = Array.from({ length: 44 }, (_, i) => {
    const studyProfile = createSampleStudyProfile(i, random);
    return { id: `S${i}`, name: `S${i}`, gender: i % 2 ? "male" : "female", grade: 1 + (i % 3), preferredGender: "any", preferredGrade: "any", studyProfile, profileType: studyProfile.profileType, status: "waiting", matchId: null };
  });
  const started = performance.now();
  const stressRecs = generateRecommendedGroups(stress);
  const elapsed = Math.round(performance.now() - started);
  allOk &= check(stressRecs.length === CONFIG.matching.topRecommendations && elapsed < 3000, `44명 전체 탐색 ${elapsed}ms, 추천 ${stressRecs.length}개`);

  lines.unshift(allOk ? "✅ 추천 알고리즘 테스트 통과" : "⚠️ 일부 항목 실패 - 아래를 확인하세요");
  const output = $("#admin-dev-output");
  output.textContent = lines.join("\n");
  output.hidden = false;
}


/* =====================================================================
   19. Utility 함수
   ===================================================================== */
function $(selector, root = document) { return root.querySelector(selector); }
function $all(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

/** DOM 요소 생성 도우미: el("p", { class: "x", text: "내용" }, [자식들]) */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

/** 오류 종류 표시용 */
class AppError extends Error {
  constructor(code) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

/** 오류 → 친절한 한국어 문구 */
function getFriendlyMessage(error) {
  if (error instanceof AppError) {
    if (error.code === "ADMIN_LOCKED") {
      const seconds = Math.max(1, Math.ceil((state.admin.lockedUntil - Date.now()) / 1000));
      return `${ERROR_MESSAGES.ADMIN_LOCKED} (${seconds}초)`;
    }
    return ERROR_MESSAGES[error.code] || ERROR_MESSAGES.UNKNOWN;
  }
  if (error && error.name === "TypeError") return ERROR_MESSAGES.NETWORK;
  return ERROR_MESSAGES.UNKNOWN;
}

/** 개발자용 오류 기록 (개인정보는 절대 넣지 않음: 오류 코드만 출력) */
function logError(context, error) {
  const code = error instanceof AppError ? error.code : (error && error.name) || "Error";
  console.warn(`[STUDY MATE] ${context}: ${code}`);
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new AppError("TIMEOUT")), ms)),
  ]);
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function pad2(n) { return String(n).padStart(2, "0"); }
function onlyDigits(text) { return String(text).replace(/\D/g, ""); }
function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
function isStringArray(v) { return Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString); }
function escapeRegExp(text) { return text.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&"); }

function formatPhone(digits) {
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 이름 가리기: 홍길동 → 홍○○ */
function maskName(name) {
  const text = String(name || "");
  return text ? text[0] + "○".repeat(Math.max(1, text.length - 1)) : "-";
}

/** 전화번호 가리기: 01012345678 → 010-12**-**** (서버 sm_mask_phone 과 같은 형식) */
function maskPhone(phone) {
  const digits = onlyDigits(phone || "");
  return digits.length < 7 ? "***" : `${digits.slice(0, 3)}-${digits.slice(3, 5)}**-****`;
}

/** 팀 코드 표시: "ST-01" → "01" (화면에는 STUDY TEAM #01) */
function formatTeamCode(teamCode) {
  const text = String(teamCode || "").replace(/^ST-?/i, "");
  return text || "-";
}

function formatClock(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** 신청시간 표시: 오늘이면 시:분:초, 아니면 월/일 시:분 */
function formatDateTimeShort(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? formatClock(date)
    : `${date.getMonth() + 1}/${date.getDate()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function findTimeSlot(slotId) {
  return CONFIG.timeSlots.find((s) => s.id === slotId) || null;
}

/** 암호학적으로 안전한 난수 (확인코드 생성용) */
function secureRandomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max; // 편향 제거
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}

function createId() {
  if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Canvas 둥근 사각형 경로 (구형 브라우저 대비 직접 구현) */
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Canvas 글자 자동 줄바꿈 (한국어는 글자 단위로 계산) */
function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const char of Array.from(text)) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      // 가능하면 공백 위치에서 줄바꿈
      const lastSpace = line.lastIndexOf(" ");
      if (lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + char;
      } else {
        lines.push(line);
        line = char;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 문항 데이터 점검 (QUESTIONS 수정 시 실수를 콘솔에 알려줌) */
function validateQuestions() {
  const ids = new Set();
  QUESTIONS.forEach((q, i) => {
    const where = `QUESTIONS[${i}] (id: ${q.id})`;
    if (ids.has(q.id)) console.warn(`[STUDY MATE] ${where}: id 가 중복되었습니다.`);
    ids.add(q.id);
    if (!["likert", "ab"].includes(q.format)) console.warn(`[STUDY MATE] ${where}: format 은 "likert" 또는 "ab" 여야 합니다.`);
    if (!SCORING_RULES.itemScales.includes(q.scale)) console.warn(`[STUDY MATE] ${where}: scale "${q.scale}" 이 SCORING_RULES.itemScales 에 없습니다.`);
    if (q.format === "ab" && (!Array.isArray(q.options) || q.options.length !== 2 || !q.options.every((o) => Number.isFinite(o.value)))) {
      console.warn(`[STUDY MATE] ${where}: A/B 문항은 value(0~100)가 있는 options 2개가 필요합니다.`);
    }
    if (q.format === "likert" && ![1, -1].includes(q.direction)) {
      console.warn(`[STUDY MATE] ${where}: 리커트 문항은 direction 이 1 또는 -1 이어야 합니다.`);
    }
  });
  SCORING_RULES.itemScales.forEach((scale) => {
    if (!QUESTIONS.some((q) => q.scale === scale)) console.warn(`[STUDY MATE] scale "${scale}" 문항이 없습니다.`);
  });
  PROFILE_TYPES.forEach((type) => {
    const mate = BEST_MATE_MAP[type.id];
    if (!mate || BEST_MATE_MAP[mate] !== type.id) console.warn(`[STUDY MATE] BEST_MATE_MAP: ${type.id} ↔ ${mate} 관계가 서로 맞지 않습니다.`);
  });
}


/* =====================================================================
   20. 시작(초기화) + 버튼 연결
   ---------------------------------------------------------------------
   HTML 버튼의 data-action 이름 → 실행할 함수
   ===================================================================== */
function restartAll() {
  state.answers = {};
  state.currentQuestionIndex = 0;
  state.profile = null;
  state.explanation = null;
  state.sessionProfileId = null;
  state.consentChecked = false;
  showView("intro");
}

const ACTIONS = {
  "start-test": startTest,
  "go-intro": () => showView("intro"),
  "restart": restartAll,
  "open-lookup": openLookup,
  "open-admin": openAdminLogin,
  "test-prev": goPrevQuestion,
  "test-next": goNextQuestion,
  "test-quit": quitTest,
  "save-card": saveResultCard,
  "apply": onApplyClick,
  "finish": () => showView("end"),
  "back-to-result": () => showView("result"),
  "back-to-notice": () => showView("notice"),
  "notice-next": onNoticeNext,
  "lookup-retry": runLookup,
  "close-card-dialog": closeCardDialog,

  // 관리자
  "admin-logout": adminLogout,
  "admin-refresh": () => refreshAdminDashboard(),
  "admin-sort": onAdminSort,
  "open-team": (button) => openTeamModal(button.dataset.matchId),
  "open-participant": (button) => openParticipantModal(button.dataset.id),
  "open-profile": (button) => openProfileModal(button.dataset.id),
  "rec-confirm": onRecommendationConfirm,
  "rec-detail": (button) => openRecommendationDetail(Number(button.dataset.recIndex)),
  "rec-recompute": onRecompute,
  "manual-confirm": onManualConfirm,
  "manual-clear": onManualClear,
  "manual-remove": (button) => toggleSelection(button.dataset.id, false),
  "danger-delete": requestEventDataDeletion,
  "dev-seed": devSeedParticipants,
  "dev-algo-test": devRunAlgorithmTest,
};

function init() {
  validateQuestions();
  DataService = selectDataService();
  applyConfigBindings();
  renderFormOptions();
  setupDevBanner();

  // 모든 data-action 버튼 클릭 처리 (이벤트 위임)
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = ACTIONS[button.dataset.action];
    if (action) action(button);
  });

  // 설문 선택지
  const optionsBox = $("#question-options");
  optionsBox.addEventListener("pointerdown", () => { lastPointerTime = Date.now(); });
  optionsBox.addEventListener("change", handleOptionChange);
  $("#question-form").addEventListener("submit", (e) => { e.preventDefault(); goNextQuestion(); });

  // 신청 안내 동의 체크
  $("#consent-check").addEventListener("change", (e) => {
    $("#btn-notice-next").disabled = !e.target.checked;
  });

  // 신청폼
  $("#apply-form").addEventListener("submit", handleApplicationSubmit);
  $("#f-phone").addEventListener("input", handlePhoneInput);
  $("#f-student-number").addEventListener("input", handleStudentNumberInput);

  // 결과 조회 / 관리자 로그인
  $("#lookup-form").addEventListener("submit", handleLookupSubmit);
  $("#admin-login-form").addEventListener("submit", handleAdminLoginSubmit);

  // 결과 카드 팝업: 바깥 영역 클릭 시 닫기
  $("#card-dialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeCardDialog();
  });

  // 관리자 대시보드
  $("#admin-search").addEventListener("input", (e) => {
    state.admin.search = e.target.value;
    if (state.admin.data) renderParticipantTable();
  });
  $("#admin-filter").addEventListener("change", (e) => {
    state.admin.filter = e.target.value;
    if (state.admin.data) renderParticipantTable();
  });
  $("#admin-mask").addEventListener("change", (e) => {
    state.admin.maskNames = e.target.checked;
    if (state.admin.data) renderAdminDashboard();
  });
  $("#admin-open-toggle").addEventListener("change", handleApplicationsToggle);
  $("#admin-max-form").addEventListener("submit", handleMaxParticipantsSubmit);
  $("#admin-table").addEventListener("change", handleAdminTableChange);

  // 관리자 팝업: 작업 중에는 Esc 로 닫히지 않게, 닫히면 내용(개인정보 포함)을 비움
  const adminModal = $("#admin-modal");
  adminModal.addEventListener("cancel", (e) => {
    if (state.admin.busy) e.preventDefault();
  });
  adminModal.addEventListener("close", () => {
    // close 이벤트는 비동기로 오므로, 그 사이 새 팝업이 열렸다면 비우지 않음
    if (adminModal.open) return;
    $("#admin-modal-body").replaceChildren();
    $("#admin-modal-actions").replaceChildren();
  });

  // 뒤로가기
  window.addEventListener("popstate", handlePopState);
  history.replaceState({ view: "intro" }, "");
  showView("intro", { push: false, focus: false });
}

document.addEventListener("DOMContentLoaded", init);
