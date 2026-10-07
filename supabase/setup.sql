-- =====================================================================
-- STUDY MATE - Supabase 설정 SQL (setup.sql)
-- ---------------------------------------------------------------------
-- 사용 방법
--   1) Supabase 대시보드 > SQL Editor > New query
--   2) 이 파일 전체를 붙여넣고 [Run]
--   3) 맨 아래 "STEP 2. 관리자 이메일 등록" 의 UPDATE 문을 본인 관리자 이메일로 바꿔 실행
--
-- 여러 번 실행해도 큰 문제가 없도록 작성했습니다.
--   (create if not exists / create or replace / drop trigger if exists 사용)
-- 이 파일은 "새 프로젝트에 처음 설치"할 때 쓰는 최신 전체본(3차 · STUDY PROFILE v1.0)입니다.
--   이미 2차 버전을 설치한 DB 는 supabase/phase3_update.sql 을 실행하세요.
--
-- 보안 구조 요약
--   - 모든 테이블 RLS 활성화 + 정책(policy) 없음 → 학생(anon)/로그인 사용자 모두 직접 조회 불가
--   - 테이블 직접 권한(SELECT/INSERT/UPDATE/DELETE)도 anon, authenticated 에서 모두 회수
--   - 학생은 최소 정보만 돌려주는 RPC 3개만 실행 가능
--   - 관리자 RPC 는 "지정된 관리자 이메일로 로그인한 Supabase Auth 사용자"만 통과
--
-- ⚠️ 성별/학년/희망조건 값은 script.js 의 CONFIG 선택지 value 와 같아야 합니다.
--    (male/female, 1~3, same/opposite/any, same/different/any)
--    CONFIG 선택지를 바꾸면 아래 CHECK 제약과 sm_submit_application 검증도 함께 바꾸세요.
-- =====================================================================


-- =====================================================================
-- 0. 확장 기능 (확인코드 난수 생성용)
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;


-- =====================================================================
-- 1. 테이블
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1-1. 운영 설정 (항상 id = 1 인 한 줄만 사용)
--      정원/신청 가능 여부를 script.js 값이 아닌 서버에서도 판단하기 위한 테이블
-- ---------------------------------------------------------------------
create table if not exists public.study_mate_settings (
  id                smallint    primary key default 1,
  applications_open boolean     not null default true,
  max_participants  integer     not null default 44,
  event_date        date        not null default date '2026-10-23',
  matching_start    time        not null default time '09:15',
  matching_end      time        not null default time '12:00',
  min_group_size    integer     not null default 2,
  max_group_size    integer     not null default 4,
  time_slot_ids     text[]      not null default array['A','B','C','D','E','F','G','H','I','J','K'],
  admin_email       text,
  updated_at        timestamptz not null default now(),
  constraint sm_settings_single_row  check (id = 1),
  constraint sm_settings_max_check   check (max_participants between 1 and 1000),
  constraint sm_settings_group_check check (min_group_size >= 2 and max_group_size >= min_group_size and max_group_size <= 6)
);

insert into public.study_mate_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 1-2. 매칭 팀
--      time_slot UNIQUE → 한 타임에 한 팀만 (DB 수준 보장)
--      해체(cancelled)된 팀은 time_slot 을 비워 타임을 반납
-- ---------------------------------------------------------------------
create table if not exists public.study_mate_matches (
  id                   uuid        primary key default gen_random_uuid(),
  team_number          integer     not null,
  team_code            text        not null,
  member_ids           uuid[]      not null default '{}',
  compatibility_score  numeric(5,2),
  compatibility_reason jsonb       not null default '[]'::jsonb,
  time_slot            text,
  status               text        not null default 'confirmed',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint sm_matches_team_number_unique unique (team_number),
  constraint sm_matches_team_code_unique   unique (team_code),
  constraint sm_matches_time_slot_unique   unique (time_slot),
  constraint sm_matches_status_check       check (status in ('draft','confirmed','in_progress','completed','cancelled')),
  constraint sm_matches_score_check        check (compatibility_score is null or compatibility_score between 0 and 100),
  constraint sm_matches_cancelled_no_slot  check (status <> 'cancelled' or time_slot is null)
);

-- ---------------------------------------------------------------------
-- 1-3. 참가자 (개인정보 포함 → 관리자 RPC 외에는 읽을 수 없음)
--      match_id 는 한 칸이므로 한 참가자는 동시에 한 팀에만 속할 수 있음
-- ---------------------------------------------------------------------
create table if not exists public.study_mate_participants (
  id                 uuid        primary key default gen_random_uuid(),
  profile_id         text,
  student_number     text        not null,
  name               text        not null,
  phone              text        not null,
  gender             text        not null,
  grade              integer     not null,
  preferred_gender   text        not null,
  preferred_grade    text        not null,
  study_profile_json jsonb       not null default '{}'::jsonb,
  profile_type       text,
  confirmation_code  text        not null,
  status             text        not null default 'waiting',
  match_id           uuid        references public.study_mate_matches(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sm_participants_code_unique      unique (confirmation_code),
  constraint sm_participants_code_format      check (confirmation_code ~ '^SM-[A-HJKMNP-Z2-9]{6}$'),
  constraint sm_participants_status_check     check (status in ('waiting','matched','checked_in','completed','cancelled','no_show')),
  constraint sm_participants_gender_check     check (gender in ('male','female')),
  constraint sm_participants_grade_check      check (grade between 1 and 3),
  constraint sm_participants_pref_gender      check (preferred_gender in ('same','opposite','any')),
  constraint sm_participants_pref_grade       check (preferred_grade in ('same','different','any')),
  constraint sm_participants_student_format   check (student_number ~ '^[0-9]{4,10}$'),
  constraint sm_participants_phone_format     check (phone ~ '^01[016789][0-9]{7,8}$'),
  constraint sm_participants_name_length      check (char_length(name) between 1 and 20),
  -- 상태와 팀 연결의 일관성: 매칭 계열 상태는 팀 필수, 대기/취소는 팀 없음, 노쇼는 둘 다 가능
  constraint sm_participants_match_consistency check (
    (status in ('matched','checked_in','completed') and match_id is not null)
    or (status in ('waiting','cancelled') and match_id is null)
    or status = 'no_show'
  )
);

-- 취소(cancelled)가 아닌 같은 학번은 1건만 허용 → 취소 후 재신청은 새 행으로 가능
create unique index if not exists sm_participants_active_student_uidx
  on public.study_mate_participants (student_number)
  where status <> 'cancelled';

create index if not exists sm_participants_status_idx  on public.study_mate_participants (status);
create index if not exists sm_participants_match_idx   on public.study_mate_participants (match_id);
create index if not exists sm_participants_created_idx on public.study_mate_participants (created_at);

-- 확인코드 형식 제약을 최신 규칙(SM- + 6자리)으로 맞춤 (다시 실행해도 안전)
-- 예전 4자리 코드가 남아 있으면 중단 → 2차 DB 는 phase3_update.sql 안내를 따르세요.
do $$
begin
  if exists (
    select 1 from public.study_mate_participants
    where confirmation_code !~ '^SM-[A-HJKMNP-Z2-9]{6}$'
  ) then
    raise exception '예전 형식(SM-XXXX) 확인코드가 남아 있습니다. supabase/phase3_update.sql 의 안내에 따라 먼저 정리하세요.';
  end if;
  alter table public.study_mate_participants drop constraint if exists sm_participants_code_format;
  alter table public.study_mate_participants
    add constraint sm_participants_code_format check (confirmation_code ~ '^SM-[A-HJKMNP-Z2-9]{6}$');
end;
$$;

-- ---------------------------------------------------------------------
-- 1-4. 확인코드 조회 실패 기록 (무차별 대입 방어용, 개인정보 없음)
--      IP 원문은 저장하지 않고 해시만 저장 / 1일 지난 기록은 자동 삭제
-- ---------------------------------------------------------------------
create table if not exists public.study_mate_lookup_failures (
  id         bigint      generated always as identity primary key,
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists sm_lookup_failures_ip_idx      on public.study_mate_lookup_failures (ip_hash, created_at);
create index if not exists sm_lookup_failures_created_idx on public.study_mate_lookup_failures (created_at);


-- =====================================================================
-- 2. updated_at 자동 갱신 트리거
-- =====================================================================
create or replace function public.sm_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sm_settings_touch on public.study_mate_settings;
create trigger sm_settings_touch before update on public.study_mate_settings
  for each row execute function public.sm_touch_updated_at();

drop trigger if exists sm_matches_touch on public.study_mate_matches;
create trigger sm_matches_touch before update on public.study_mate_matches
  for each row execute function public.sm_touch_updated_at();

drop trigger if exists sm_participants_touch on public.study_mate_participants;
create trigger sm_participants_touch before update on public.study_mate_participants
  for each row execute function public.sm_touch_updated_at();


-- =====================================================================
-- 3. RLS (Row Level Security) + 테이블 직접 권한 회수
--    정책(policy)을 하나도 만들지 않으므로 anon/authenticated 는 행을 볼 수 없습니다.
--    (아래 security definer 함수만 테이블 소유자 권한으로 데이터에 접근)
-- =====================================================================
alter table public.study_mate_settings     enable row level security;
alter table public.study_mate_matches      enable row level security;
alter table public.study_mate_participants enable row level security;
alter table public.study_mate_lookup_failures enable row level security;

revoke all on table public.study_mate_settings     from anon, authenticated;
revoke all on table public.study_mate_matches      from anon, authenticated;
revoke all on table public.study_mate_participants from anon, authenticated;
revoke all on table public.study_mate_lookup_failures from anon, authenticated;


-- =====================================================================
-- 4. 내부 도우미 함수 (학생/관리자 모두 직접 실행 불가)
-- =====================================================================

-- 4-1. 관리자 여부: 로그인 사용자 = 설정된 관리자 이메일 + 이메일 인증 완료 + JWT 이메일 일치
create or replace function public.sm_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.study_mate_settings s on s.id = 1
    where u.id = auth.uid()
      and s.admin_email is not null
      and lower(u.email) = lower(s.admin_email)
      and lower(coalesce(auth.jwt() ->> 'email', '')) = lower(s.admin_email)
      and u.email_confirmed_at is not null
  );
$$;

-- 4-2. 관리자 확인 (아니면 오류)
create or replace function public.sm_assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sm_is_admin() then
    raise exception 'SM_NOT_ADMIN' using errcode = '42501';
  end if;
end;
$$;

-- 4-3. HARD FILTER: me 의 희망 조건을 상대(other)가 만족하는가 (양방향 검사는 호출하는 쪽에서 두 번 호출)
create or replace function public.sm_pref_ok(
  me_gender text, me_pref_gender text, me_grade integer, me_pref_grade text,
  other_gender text, other_grade integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (me_pref_gender = 'any'
          or (me_pref_gender = 'same'     and me_gender =  other_gender)
          or (me_pref_gender = 'opposite' and me_gender <> other_gender))
     and (me_pref_grade = 'any'
          or (me_pref_grade = 'same'      and me_grade =  other_grade)
          or (me_pref_grade = 'different' and me_grade <> other_grade));
$$;

-- 4-4. 전화번호 마스킹: 01012345678 → 010-12**-****
create or replace function public.sm_mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or length(p_phone) < 7 then '***'
    else substr(p_phone, 1, 3) || '-' || substr(p_phone, 4, 2) || '**-****'
  end;
$$;

-- 4-5. 확인코드 생성: SM-XXXXXX (6자리, 0, O, 1, I, L 제외 → 31^6 ≈ 8.9억 가지 / 암호학적 난수 / 중복 시 재생성)
create or replace function public.sm_generate_confirmation_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_byte     integer;
  v_attempt  integer := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 500 then
      raise exception 'SM_CODE_GENERATION_FAILED';
    end if;

    v_code := 'SM-';
    while length(v_code) < 9 loop
      v_byte := get_byte(extensions.gen_random_bytes(1), 0);
      if v_byte < 248 then -- 31 × 8 = 248 미만만 사용 (편향 제거)
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
      end if;
    end loop;

    exit when not exists (
      select 1 from public.study_mate_participants where confirmation_code = v_code
    );
  end loop;
  return v_code;
end;
$$;

-- 4-6. STUDY STYLE 유형 계산 (script.js 의 PROFILE_TYPES / determineProfileType 과 같은 규칙)
--      세 축 점수가 50 이상이면 high, 미만이면 low → 8개 유형
--      신청 시 브라우저가 보낸 유형이 점수와 맞는지 서버에서 다시 확인하는 데 사용
create or replace function public.sm_profile_type(p_exploration integer, p_reflection integer, p_relationship integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_exploration >= 50 and p_reflection >= 50 and p_relationship <  50 then 'careful_explorer'
    when p_exploration >= 50 and p_reflection >= 50 and p_relationship >= 50 then 'strategic_collaborator'
    when p_exploration >= 50 and p_reflection <  50 and p_relationship <  50 then 'self_directed_executor'
    when p_exploration >= 50 and p_reflection <  50 and p_relationship >= 50 then 'idea_executor'
    when p_exploration <  50 and p_reflection >= 50 and p_relationship <  50 then 'feedback_designer'
    when p_exploration <  50 and p_reflection >= 50 and p_relationship >= 50 then 'feedback_coordinator'
    when p_exploration <  50 and p_reflection <  50 and p_relationship <  50 then 'fast_adapter'
    when p_exploration <  50 and p_reflection <  50 and p_relationship >= 50 then 'energy_learning_mate'
  end;
$$;

-- 4-7. 새 신청을 받을 타임 여유가 없는지
--      빈 타임이 0개이거나, (현재 대기자 + 새 신청 1명)이 남은 타임 × 최대 팀 인원보다 많으면 true
create or replace function public.sm_slots_full(s public.study_mate_settings)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_used_slots integer;
  v_free_slots integer;
  v_waiting    integer;
begin
  select count(*) into v_used_slots
  from public.study_mate_matches
  where time_slot is not null and status <> 'cancelled';
  v_free_slots := coalesce(array_length(s.time_slot_ids, 1), 0) - v_used_slots;
  if v_free_slots <= 0 then
    return true;
  end if;

  select count(*) into v_waiting
  from public.study_mate_participants
  where status = 'waiting';
  return v_waiting + 1 > v_free_slots * s.max_group_size;
end;
$$;


-- =====================================================================
-- 5. 학생용 RPC (anon 실행 가능, 개인정보 반환 없음)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 5-1. 신청 가능 여부 / 인원 수
-- ---------------------------------------------------------------------
create or replace function public.sm_get_application_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s            public.study_mate_settings;
  v_active     integer;
  v_used_slots integer;
begin
  select * into s from public.study_mate_settings where id = 1;

  select count(*) into v_active
  from public.study_mate_participants
  where status <> 'cancelled';

  select count(*) into v_used_slots
  from public.study_mate_matches
  where time_slot is not null and status <> 'cancelled';

  return jsonb_build_object(
    'applicationsOpen',   s.applications_open,
    'currentApplicants',  v_active,
    'maxParticipants',    s.max_participants,
    'remainingCapacity',  greatest(s.max_participants - v_active, 0),
    'remainingTimeSlots', greatest(coalesce(array_length(s.time_slot_ids, 1), 0) - v_used_slots, 0),
    'slotsFull',          public.sm_slots_full(s)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5-2. 신청 저장 + 확인코드 발급 (모든 값 서버에서 재검증)
--      오류 코드(메시지): SM_INVALID / SM_CLOSED / SM_FULL / SM_SLOTS_FULL / SM_DUPLICATE
--      studyProfile 은 최종 계산값만 받습니다 (원본 16문항 응답은 받지 않음)
--        { version: "1.0", explorationScore, reflectionScore, relationshipScore, challengeStimulus: 0~100 정수,
--          profileType } → 점수로 유형을 다시 계산해 일치해야 저장, 허용한 키만 다시 만들어 저장
--      동시성: 신청 잠금 → 팀 확정 잠금 순서로 잡아 (행사 데이터 삭제와 같은 순서)
--              정원 마지막 1자리 / 마지막 타임 배정과 동시에 들어온 신청도 한 번에 하나씩 판단
-- ---------------------------------------------------------------------
create or replace function public.sm_submit_application(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s                public.study_mate_settings;
  v_student_number text;
  v_name           text;
  v_phone          text;
  v_gender         text;
  v_grade_text     text;
  v_pref_gender    text;
  v_pref_grade     text;
  v_profile        jsonb;
  v_profile_type   text;
  v_profile_id     text;
  v_exploration    integer;
  v_reflection     integer;
  v_relationship   integer;
  v_challenge      integer;
  v_expected_type  text;
  v_clean_profile  jsonb;
  v_active         integer;
  v_code           text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8000 then
    raise exception 'SM_INVALID';
  end if;

  v_student_number := btrim(coalesce(p_payload ->> 'studentNumber', ''));
  v_name           := btrim(coalesce(p_payload ->> 'name', ''));
  v_phone          := regexp_replace(coalesce(p_payload ->> 'phone', ''), '[^0-9]', '', 'g');
  v_gender         := coalesce(p_payload ->> 'gender', '');
  v_grade_text     := coalesce(p_payload ->> 'grade', '');
  v_pref_gender    := coalesce(p_payload ->> 'preferredGender', '');
  v_pref_grade     := coalesce(p_payload ->> 'preferredGrade', '');
  v_profile        := coalesce(p_payload -> 'studyProfile', 'null'::jsonb);
  v_profile_type   := coalesce(p_payload ->> 'profileType', '');
  v_profile_id     := left(coalesce(p_payload ->> 'profileId', ''), 64);

  -- 필수 값 / 형식 검증
  if v_student_number !~ '^[0-9]{4,10}$'
     or char_length(v_name) not between 2 and 20
     or v_phone !~ '^01[016789][0-9]{7,8}$'
     or v_gender not in ('male','female')
     or v_grade_text !~ '^[1-3]$'
     or v_pref_gender not in ('same','opposite','any')
     or v_pref_grade not in ('same','different','any')
     or jsonb_typeof(v_profile) is distinct from 'object'
  then
    raise exception 'SM_INVALID';
  end if;

  -- STUDY PROFILE 검증: 지원 버전 + 네 점수 모두 0~100 정수
  if (v_profile ->> 'version') is distinct from '1.0'
     or jsonb_typeof(v_profile -> 'explorationScore')  is distinct from 'number'
     or jsonb_typeof(v_profile -> 'reflectionScore')   is distinct from 'number'
     or jsonb_typeof(v_profile -> 'relationshipScore') is distinct from 'number'
     or jsonb_typeof(v_profile -> 'challengeStimulus') is distinct from 'number'
     or (v_profile ->> 'explorationScore')  !~ '^(100|[1-9]?[0-9])$'
     or (v_profile ->> 'reflectionScore')   !~ '^(100|[1-9]?[0-9])$'
     or (v_profile ->> 'relationshipScore') !~ '^(100|[1-9]?[0-9])$'
     or (v_profile ->> 'challengeStimulus') !~ '^(100|[1-9]?[0-9])$'
  then
    raise exception 'SM_INVALID';
  end if;

  v_exploration  := (v_profile ->> 'explorationScore')::integer;
  v_reflection   := (v_profile ->> 'reflectionScore')::integer;
  v_relationship := (v_profile ->> 'relationshipScore')::integer;
  v_challenge    := (v_profile ->> 'challengeStimulus')::integer;

  -- 유형은 점수로 다시 계산한 값과 같아야 함 (조작된 유형 차단)
  v_expected_type := public.sm_profile_type(v_exploration, v_reflection, v_relationship);
  if (v_profile ->> 'profileType') is distinct from v_expected_type
     or v_profile_type is distinct from v_expected_type
  then
    raise exception 'SM_INVALID';
  end if;

  -- 허용한 키만 저장 (추가로 보낸 값은 버림)
  v_clean_profile := jsonb_build_object(
    'version',           '1.0',
    'explorationScore',  v_exploration,
    'reflectionScore',   v_reflection,
    'relationshipScore', v_relationship,
    'challengeStimulus', v_challenge,
    'profileType',       v_expected_type
  );

  -- 동시에 여러 명이 신청해도 정원·타임을 넘지 않도록 순서대로 처리
  -- (팀 확정 잠금도 함께 잡아, 마지막 타임이 배정되는 순간과 겹친 신청도 정확히 판단)
  perform pg_advisory_xact_lock(hashtext('study_mate_submit'));
  perform pg_advisory_xact_lock(hashtext('study_mate_match'));

  select * into s from public.study_mate_settings where id = 1;
  if not s.applications_open then
    raise exception 'SM_CLOSED';
  end if;

  -- 정원: 취소(cancelled)를 제외한 실제 활성 참가자 기준
  select count(*) into v_active
  from public.study_mate_participants
  where status <> 'cancelled';
  if v_active >= s.max_participants then
    raise exception 'SM_FULL';
  end if;

  -- 타임: 11개 타임이 모두 배정되었거나 남은 타임으로 더 받을 수 없으면 자동 마감
  if public.sm_slots_full(s) then
    raise exception 'SM_SLOTS_FULL';
  end if;

  -- 같은 학번의 활성 신청(취소 제외)이 있으면 거절
  if exists (
    select 1 from public.study_mate_participants
    where student_number = v_student_number and status <> 'cancelled'
  ) then
    raise exception 'SM_DUPLICATE';
  end if;

  v_code := public.sm_generate_confirmation_code();

  insert into public.study_mate_participants (
    profile_id, student_number, name, phone, gender, grade,
    preferred_gender, preferred_grade, study_profile_json, profile_type,
    confirmation_code, status
  ) values (
    nullif(v_profile_id, ''), v_student_number, v_name, v_phone, v_gender, v_grade_text::integer,
    v_pref_gender, v_pref_grade, v_clean_profile, v_expected_type,
    v_code, 'waiting'
  );

  return jsonb_build_object('success', true, 'confirmationCode', v_code);
exception
  when unique_violation then
    raise exception 'SM_DUPLICATE';
end;
$$;

-- ---------------------------------------------------------------------
-- 5-3. 확인코드로 내 매칭 결과 조회 (상대 정보 절대 반환하지 않음)
--      입력 예: SM-K7F2Q8 / sm-k7f2q8 / K7F2Q8 / smk7f2q8 모두 같은 코드로 처리
--      무차별 대입 방어 (best-effort)
--        - 코드 6자리 = 31^6 ≈ 8.9억 가지
--        - 찾지 못한 조회를 IP 해시 기준으로 기록 → 10분에 60회 이상 실패하면 SM_RATE_LIMITED
--        - 형식 오류와 '없는 코드'는 같은 응답({found:false})으로 처리해 정보를 주지 않음
--        ※ 학교 와이파이처럼 여러 학생이 같은 공인 IP 를 쓰면 함께 제한될 수 있어 기준을 넉넉히 잡았습니다.
-- ---------------------------------------------------------------------
create or replace function public.sm_lookup_match(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_max_failures constant integer  := 60;
  c_window       constant interval := interval '10 minutes';
  v_headers   jsonb;
  v_ip        text;
  v_ip_hash   text;
  v_failures  integer;
  v_clean     text;
  v_code      text := null;
  v_status    text;
  v_match_id  uuid;
  v_team_code text;
  v_score     numeric;
  v_slot      text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1));
  if v_ip = '' then
    v_ip := 'unknown';
  end if;
  v_ip_hash := encode(extensions.digest('study_mate_lookup:' || v_ip, 'sha256'), 'hex');

  select count(*) into v_failures
  from public.study_mate_lookup_failures
  where ip_hash = v_ip_hash and created_at > now() - c_window;
  if v_failures >= c_max_failures then
    raise exception 'SM_RATE_LIMITED';
  end if;

  v_clean := regexp_replace(upper(left(coalesce(p_code, ''), 40)), '[^A-Z0-9]', '', 'g');
  if char_length(v_clean) = 8 and left(v_clean, 2) = 'SM' then
    v_code := 'SM-' || substr(v_clean, 3);
  elsif char_length(v_clean) = 6 then
    v_code := 'SM-' || v_clean;
  end if;

  if v_code is not null then
    select status, match_id into v_status, v_match_id
    from public.study_mate_participants
    where confirmation_code = v_code;
  end if;

  if v_code is null or v_status is null then
    insert into public.study_mate_lookup_failures (ip_hash) values (v_ip_hash);
    delete from public.study_mate_lookup_failures where created_at < now() - interval '1 day';
    return jsonb_build_object('found', false);
  end if;

  if v_match_id is not null then
    select team_code, compatibility_score, time_slot
      into v_team_code, v_score, v_slot
    from public.study_mate_matches
    where id = v_match_id and status <> 'cancelled';
  end if;

  return jsonb_build_object(
    'found',              true,
    'status',             v_status,
    'teamCode',           v_team_code,
    'compatibilityScore', case when v_score is null then null else round(v_score) end,
    'timeSlot',           v_slot,
    'message', case v_status
      when 'waiting'    then '아직 STUDY MATE를 찾고 있어요.'
      when 'matched'    then case when v_slot is null then '팀이 정해졌어요! 참가 시간을 준비하고 있어요.' else 'IT''S A STUDY MATCH!' end
      when 'checked_in' then '입장이 확인되었어요.'
      when 'completed'  then 'STUDY MATE 활동을 마쳤어요.'
      when 'cancelled'  then '참가 신청이 취소되었습니다.'
      when 'no_show'    then '참여 기록이 확인되지 않았어요.'
      else null
    end
  );
end;
$$;


-- =====================================================================
-- 6. 관리자용 RPC (모두 sm_assert_admin() 으로 관리자 계정 확인)
--    방식 선택: "관리자 RPC" (테이블 SELECT 정책 대신)
--    - 관리자 권한 검사를 함수 한 곳에서 일관되게 처리
--    - 목록에서는 전화번호를 마스킹해서 반환하고, 전체 번호는 상세 조회 RPC 에서만 반환
-- =====================================================================

-- ---------------------------------------------------------------------
-- 6-1. 대시보드 전체 데이터 (설정 + 참가자[전화번호 마스킹] + 팀)
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.sm_assert_admin();

  return jsonb_build_object(
    'settings', (
      select jsonb_build_object(
        'applicationsOpen', applications_open,
        'maxParticipants',  max_participants,
        'eventDate',        event_date,
        'minGroupSize',     min_group_size,
        'maxGroupSize',     max_group_size,
        'timeSlotIds',      to_jsonb(time_slot_ids)
      )
      from public.study_mate_settings where id = 1
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',               p.id,
        'studentNumber',    p.student_number,
        'name',             p.name,
        'phoneMasked',      public.sm_mask_phone(p.phone),
        'gender',           p.gender,
        'grade',            p.grade,
        'preferredGender',  p.preferred_gender,
        'preferredGrade',   p.preferred_grade,
        'studyProfile',     p.study_profile_json,
        'profileType',      p.profile_type,
        'confirmationCode', p.confirmation_code,
        'status',           p.status,
        'matchId',          p.match_id,
        'createdAt',        p.created_at,
        'updatedAt',        p.updated_at
      ) order by p.created_at)
      from public.study_mate_participants p
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',                  m.id,
        'teamCode',            m.team_code,
        'memberIds',           to_jsonb(m.member_ids),
        'compatibilityScore',  m.compatibility_score,
        'compatibilityReason', m.compatibility_reason,
        'timeSlot',            m.time_slot,
        'status',              m.status,
        'createdAt',           m.created_at
      ) order by m.team_number)
      from public.study_mate_matches m
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6-2. 참가자 한 명의 전체 전화번호 (상세보기에서 [전화번호 확인]을 눌렀을 때만, 목록 조회에는 마스킹 번호만)
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_get_participant_contact(p_participant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  perform public.sm_assert_admin();
  select phone into v_phone from public.study_mate_participants where id = p_participant_id;
  if not found then
    raise exception 'SM_MEMBER_NOT_FOUND';
  end if;
  return jsonb_build_object('phone', v_phone);
end;
$$;

-- ---------------------------------------------------------------------
-- 6-3. 팀 확정 + 타임 배정 (프론트 검증과 별개로 서버에서 다시 검증)
--      오류: SM_DUPLICATE_MEMBER / SM_GROUP_SIZE / SM_SLOT_INVALID / SM_MEMBER_NOT_FOUND
--            SM_MEMBER_NOT_WAITING / SM_HARD_FILTER / SM_SLOT_TAKEN
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_create_match(
  p_member_ids           uuid[],
  p_time_slot            text,
  p_compatibility_score  numeric default null,
  p_compatibility_reason jsonb   default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s             public.study_mate_settings;
  v_ids         uuid[];
  v_count       integer;
  v_found       integer;
  v_not_waiting integer;
  v_bad_pair    boolean;
  v_team_number integer;
  v_team_code   text;
  v_match_id    uuid;
begin
  perform public.sm_assert_admin();
  select * into s from public.study_mate_settings where id = 1;

  select coalesce(array_agg(distinct x), '{}') into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as x;
  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count <> coalesce(array_length(p_member_ids, 1), 0) then
    raise exception 'SM_DUPLICATE_MEMBER';
  end if;
  if v_count < s.min_group_size or v_count > s.max_group_size then
    raise exception 'SM_GROUP_SIZE';
  end if;
  if p_time_slot is null or not (p_time_slot = any (s.time_slot_ids)) then
    raise exception 'SM_SLOT_INVALID';
  end if;

  -- 팀 확정 작업은 한 번에 하나씩 처리
  perform pg_advisory_xact_lock(hashtext('study_mate_match'));

  -- 구성원 행 잠금 + 존재 확인 (없는 참가자 ID 차단)
  perform 1 from public.study_mate_participants where id = any (v_ids) for update;
  select count(*) into v_found from public.study_mate_participants where id = any (v_ids);
  if v_found <> v_count then
    raise exception 'SM_MEMBER_NOT_FOUND';
  end if;

  -- 모두 대기 상태 + 팀 없음 (이미 matched 인 참가자 차단)
  select count(*) into v_not_waiting
  from public.study_mate_participants
  where id = any (v_ids) and (status <> 'waiting' or match_id is not null);
  if v_not_waiting > 0 then
    raise exception 'SM_MEMBER_NOT_WAITING';
  end if;

  -- HARD FILTER: 모든 구성원 쌍이 서로의 조건을 만족해야 함 (양방향)
  select exists (
    select 1
    from public.study_mate_participants a
    join public.study_mate_participants b on a.id < b.id
    where a.id = any (v_ids) and b.id = any (v_ids)
      and not (
        public.sm_pref_ok(a.gender, a.preferred_gender, a.grade, a.preferred_grade, b.gender, b.grade)
        and public.sm_pref_ok(b.gender, b.preferred_gender, b.grade, b.preferred_grade, a.gender, a.grade)
      )
  ) into v_bad_pair;
  if v_bad_pair then
    raise exception 'SM_HARD_FILTER';
  end if;

  -- 타임 중복 확인 (UNIQUE 제약으로도 한 번 더 막힘)
  if exists (select 1 from public.study_mate_matches where time_slot = p_time_slot) then
    raise exception 'SM_SLOT_TAKEN';
  end if;

  -- 팀 코드: ST-01, ST-02 ... (해체된 팀 번호는 재사용하지 않음)
  select coalesce(max(team_number), 0) + 1 into v_team_number from public.study_mate_matches;
  v_team_code := 'ST-' || lpad(v_team_number::text, 2, '0');

  insert into public.study_mate_matches (
    team_number, team_code, member_ids, compatibility_score, compatibility_reason, time_slot, status
  ) values (
    v_team_number, v_team_code, v_ids,
    case when p_compatibility_score is null then null else least(greatest(p_compatibility_score, 0), 100) end,
    coalesce(p_compatibility_reason, '[]'::jsonb),
    p_time_slot, 'confirmed'
  )
  returning id into v_match_id;

  update public.study_mate_participants
  set status = 'matched', match_id = v_match_id
  where id = any (v_ids);

  return jsonb_build_object('matchId', v_match_id, 'teamCode', v_team_code, 'timeSlot', p_time_slot);
exception
  when unique_violation then
    raise exception 'SM_SLOT_TAKEN';
end;
$$;

-- ---------------------------------------------------------------------
-- 6-4. 참가 상태 변경
--      - 팀이 있는 참가자를 대기/취소로 바꾸면 팀에서 분리
--      - 남은 인원이 최소 인원 미만이면 p_allow_dissolve = true 일 때만 팀 해체
--        (해체 시 남은 학생은 waiting 으로, 타임은 반납 / 다른 학생 자동 추가 없음)
--      오류: SM_INVALID_STATUS / SM_MEMBER_NOT_FOUND / SM_STATUS_NEEDS_MATCH
--            SM_GROUP_TOO_SMALL / SM_DUPLICATE(취소 → 대기 복구 시 같은 학번 활성 신청 존재)
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_update_participant_status(
  p_participant_id uuid,
  p_new_status     text,
  p_allow_dissolve boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s           public.study_mate_settings;
  p           public.study_mate_participants;
  v_match     public.study_mate_matches;
  v_remaining uuid[];
  v_dissolved boolean := false;
  v_team_code text := null;
begin
  perform public.sm_assert_admin();

  if p_new_status is null or p_new_status not in ('waiting','matched','checked_in','completed','cancelled','no_show') then
    raise exception 'SM_INVALID_STATUS';
  end if;

  perform pg_advisory_xact_lock(hashtext('study_mate_match'));
  select * into s from public.study_mate_settings where id = 1;

  select * into p from public.study_mate_participants where id = p_participant_id for update;
  if not found then
    raise exception 'SM_MEMBER_NOT_FOUND';
  end if;

  if p.status = p_new_status then
    return jsonb_build_object('status', p.status, 'matchDissolved', false, 'teamCode', null);
  end if;

  if p_new_status in ('matched','checked_in','completed') and p.match_id is null then
    raise exception 'SM_STATUS_NEEDS_MATCH';
  end if;

  if p_new_status in ('waiting','cancelled') and p.match_id is not null then
    select * into v_match from public.study_mate_matches where id = p.match_id for update;
    v_team_code := v_match.team_code;
    v_remaining := array_remove(v_match.member_ids, p.id);

    update public.study_mate_participants
    set status = p_new_status, match_id = null
    where id = p.id;

    if coalesce(array_length(v_remaining, 1), 0) < s.min_group_size then
      if not coalesce(p_allow_dissolve, false) then
        raise exception 'SM_GROUP_TOO_SMALL';
      end if;

      update public.study_mate_participants
      set match_id = null,
          status = case when status = 'no_show' then 'no_show' else 'waiting' end
      where match_id = v_match.id;

      update public.study_mate_matches
      set status = 'cancelled', time_slot = null, member_ids = v_remaining
      where id = v_match.id;

      v_dissolved := true;
    else
      update public.study_mate_matches set member_ids = v_remaining where id = v_match.id;
    end if;
  else
    update public.study_mate_participants set status = p_new_status where id = p.id;
  end if;

  return jsonb_build_object('status', p_new_status, 'matchDissolved', v_dissolved, 'teamCode', v_team_code);
exception
  when unique_violation then
    raise exception 'SM_DUPLICATE';
end;
$$;

-- ---------------------------------------------------------------------
-- 6-5. 팀 타임 변경 (빈 타임으로만)
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_assign_time_slot(p_match_id uuid, p_time_slot text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s       public.study_mate_settings;
  v_match public.study_mate_matches;
begin
  perform public.sm_assert_admin();
  select * into s from public.study_mate_settings where id = 1;

  if p_time_slot is null or not (p_time_slot = any (s.time_slot_ids)) then
    raise exception 'SM_SLOT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('study_mate_match'));

  select * into v_match from public.study_mate_matches where id = p_match_id for update;
  if not found or v_match.status = 'cancelled' then
    raise exception 'SM_MATCH_NOT_FOUND';
  end if;

  if exists (select 1 from public.study_mate_matches where time_slot = p_time_slot and id <> p_match_id) then
    raise exception 'SM_SLOT_TAKEN';
  end if;

  update public.study_mate_matches set time_slot = p_time_slot where id = p_match_id;
  return jsonb_build_object('matchId', p_match_id, 'timeSlot', p_time_slot);
exception
  when unique_violation then
    raise exception 'SM_SLOT_TAKEN';
end;
$$;

-- ---------------------------------------------------------------------
-- 6-6. 팀 해체 (재매칭용) - 구성원은 waiting 으로, 타임 반납
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_dissolve_match(p_match_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_match public.study_mate_matches;
  v_count integer;
begin
  perform public.sm_assert_admin();
  perform pg_advisory_xact_lock(hashtext('study_mate_match'));

  select * into v_match from public.study_mate_matches where id = p_match_id for update;
  if not found or v_match.status = 'cancelled' then
    raise exception 'SM_MATCH_NOT_FOUND';
  end if;

  if exists (select 1 from public.study_mate_participants where match_id = p_match_id and status = 'completed') then
    raise exception 'SM_MATCH_COMPLETED';
  end if;

  update public.study_mate_participants
  set match_id = null,
      status = case when status = 'no_show' then 'no_show' else 'waiting' end
  where match_id = p_match_id;
  get diagnostics v_count = row_count;

  update public.study_mate_matches
  set status = 'cancelled', time_slot = null
  where id = p_match_id;

  return jsonb_build_object('matchId', p_match_id, 'releasedMembers', v_count);
end;
$$;

-- ---------------------------------------------------------------------
-- 6-7. 신청 열기/마감
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_toggle_applications(p_open boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.sm_assert_admin();
  if p_open is null then
    raise exception 'SM_INVALID';
  end if;
  update public.study_mate_settings set applications_open = p_open where id = 1;
  return jsonb_build_object('applicationsOpen', p_open);
end;
$$;

-- ---------------------------------------------------------------------
-- 6-8. 정원 변경
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_set_max_participants(p_max integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.sm_assert_admin();
  if p_max is null or p_max < 1 or p_max > 1000 then
    raise exception 'SM_INVALID';
  end if;
  update public.study_mate_settings set max_participants = p_max where id = 1;
  return jsonb_build_object('maxParticipants', p_max);
end;
$$;

-- ---------------------------------------------------------------------
-- 6-9. 행사 종료 데이터 전체 삭제 (참가자 + 팀 + 조회 실패 기록 / 설정은 유지)
--      p_confirm 에 정확히 '삭제' 를 넣어야 실행
-- ---------------------------------------------------------------------
create or replace function public.sm_admin_delete_event_data(p_confirm text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_participants integer;
  v_matches      integer;
begin
  perform public.sm_assert_admin();
  if p_confirm is distinct from '삭제' then
    raise exception 'SM_CONFIRM_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext('study_mate_submit'));
  perform pg_advisory_xact_lock(hashtext('study_mate_match'));

  -- 참가자가 팀을 참조하므로 참가자부터 삭제
  delete from public.study_mate_participants where true;
  get diagnostics v_participants = row_count;

  delete from public.study_mate_matches where true;
  get diagnostics v_matches = row_count;

  delete from public.study_mate_lookup_failures where true;

  return jsonb_build_object('deletedParticipants', v_participants, 'deletedMatches', v_matches);
end;
$$;


-- =====================================================================
-- 7. 함수 실행 권한
--    PostgreSQL/Supabase 는 새 함수에 기본 실행 권한을 주므로 먼저 모두 회수한 뒤 필요한 것만 허용
-- =====================================================================

-- 7-1. 내부 함수: 누구도 직접 실행 불가 (security definer 함수 안에서만 사용)
revoke all on function public.sm_touch_updated_at()                                   from public, anon, authenticated;
revoke all on function public.sm_assert_admin()                                       from public, anon, authenticated;
revoke all on function public.sm_pref_ok(text, text, integer, text, text, integer)   from public, anon, authenticated;
revoke all on function public.sm_mask_phone(text)                                     from public, anon, authenticated;
revoke all on function public.sm_generate_confirmation_code()                         from public, anon, authenticated;
revoke all on function public.sm_profile_type(integer, integer, integer)              from public, anon, authenticated;
revoke all on function public.sm_slots_full(public.study_mate_settings)               from public, anon, authenticated;

-- 7-2. 학생용: anon(비로그인) + authenticated
revoke all on function public.sm_get_application_status()  from public;
revoke all on function public.sm_submit_application(jsonb) from public;
revoke all on function public.sm_lookup_match(text)        from public;
grant execute on function public.sm_get_application_status()  to anon, authenticated;
grant execute on function public.sm_submit_application(jsonb) to anon, authenticated;
grant execute on function public.sm_lookup_match(text)        to anon, authenticated;

-- 7-3. 관리자용: 로그인 사용자만 호출 가능 + 함수 내부에서 관리자 이메일 재확인
revoke all on function public.sm_is_admin()                                                  from public, anon;
revoke all on function public.sm_admin_get_dashboard()                                       from public, anon;
revoke all on function public.sm_admin_get_participant_contact(uuid)                         from public, anon;
revoke all on function public.sm_admin_create_match(uuid[], text, numeric, jsonb)            from public, anon;
revoke all on function public.sm_admin_update_participant_status(uuid, text, boolean)        from public, anon;
revoke all on function public.sm_admin_assign_time_slot(uuid, text)                          from public, anon;
revoke all on function public.sm_admin_dissolve_match(uuid)                                  from public, anon;
revoke all on function public.sm_admin_toggle_applications(boolean)                          from public, anon;
revoke all on function public.sm_admin_set_max_participants(integer)                         from public, anon;
revoke all on function public.sm_admin_delete_event_data(text)                               from public, anon;

grant execute on function public.sm_is_admin()                                           to authenticated;
grant execute on function public.sm_admin_get_dashboard()                                to authenticated;
grant execute on function public.sm_admin_get_participant_contact(uuid)                  to authenticated;
grant execute on function public.sm_admin_create_match(uuid[], text, numeric, jsonb)     to authenticated;
grant execute on function public.sm_admin_update_participant_status(uuid, text, boolean) to authenticated;
grant execute on function public.sm_admin_assign_time_slot(uuid, text)                   to authenticated;
grant execute on function public.sm_admin_dissolve_match(uuid)                           to authenticated;
grant execute on function public.sm_admin_toggle_applications(boolean)                   to authenticated;
grant execute on function public.sm_admin_set_max_participants(integer)                  to authenticated;
grant execute on function public.sm_admin_delete_event_data(text)                        to authenticated;


-- =====================================================================
-- STEP 2. 관리자 이메일 등록 (★ 직접 수정 후 실행)
-- ---------------------------------------------------------------------
-- 1) Authentication > Users > [Add user] 로 관리자 계정을 먼저 만드세요.
--    (Auto Confirm User 체크 → 이메일 인증 완료 상태로 생성)
-- 2) 아래 이메일을 그 계정 이메일로 바꾸고, 주석(--)을 지운 뒤 실행하세요.
-- 3) script.js 의 SUPABASE_CONFIG.adminEmail 에도 같은 이메일을 넣으세요.
--
-- update public.study_mate_settings set admin_email = 'admin@example.com' where id = 1;
-- =====================================================================
