-- =====================================================================
-- STUDY MATE - 3차 업데이트 SQL (phase3_update.sql)
-- ---------------------------------------------------------------------
-- 대상: 2차 버전 setup.sql 을 이미 실행한 Supabase 프로젝트
--       (새 프로젝트는 이 파일 대신 최신 setup.sql 하나만 실행하면 됩니다)
--
-- 바뀌는 내용
--   1) 확인코드 SM-XXXX(4자리) → SM-XXXXXX(6자리) : 형식 제약 / 생성 함수 / 조회 정규화
--   2) 신청 시 STUDY PROFILE(v1.0) 서버 검증 : 0~100 정수 점수 + 점수로 다시 계산한 유형과 일치해야 저장
--      (허용한 키만 저장, 원본 16문항 응답은 저장하지 않음)
--   3) 11개 타임이 모두 배정되면(또는 남은 타임으로 더 받을 수 없으면) 새 신청 자동 거절 + 상태 조회에 slotsFull
--   4) 신청 함수가 팀 확정 잠금도 함께 잡아 '마지막 타임 배정'과 동시에 들어온 신청도 정확히 판단
--   5) 확인코드 조회 실패 횟수 제한 (IP 해시 기준, 10분 60회) + 행사 데이터 삭제 시 함께 삭제
--
-- 사용 방법
--   1) Supabase 대시보드 > SQL Editor > New query → 이 파일 전체 붙여넣기 → [Run]
--   2) "예전 형식(SM-XXXX) 확인코드가 남아 있습니다" 오류가 나면:
--      - 리허설/테스트 데이터라면 아래 [리허설 데이터 정리] 주석을 풀어 먼저 실행한 뒤 다시 실행하세요.
--      - 실제 참가자 데이터가 있다면 업데이트를 중단하고 운영진과 상의하세요.
--        (4자리 코드를 받은 학생이 있으므로 행사 중에는 업데이트하지 않는 것을 권장합니다)
--   여러 번 실행해도 안전합니다.
--
-- [리허설 데이터 정리] (⚠️ 참가자·팀 데이터가 모두 삭제됩니다)
--   delete from public.study_mate_participants where true;
--   delete from public.study_mate_matches where true;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 사전 점검: 예전 4자리 코드가 남아 있으면 아무것도 바꾸지 않고 중단
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.study_mate_participants
    where confirmation_code !~ '^SM-[A-HJKMNP-Z2-9]{6}$'
  ) then
    raise exception '예전 형식(SM-XXXX) 확인코드가 남아 있습니다. 파일 맨 위 [리허설 데이터 정리] 안내를 확인하세요.';
  end if;
end;
$$;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. 확인코드 형식 제약 → 6자리
-- ---------------------------------------------------------------------
alter table public.study_mate_participants drop constraint if exists sm_participants_code_format;
alter table public.study_mate_participants
  add constraint sm_participants_code_format check (confirmation_code ~ '^SM-[A-HJKMNP-Z2-9]{6}$');

-- ---------------------------------------------------------------------
-- 2. 확인코드 조회 실패 기록 테이블 (IP 원문 없음, 해시만 / 1일 후 자동 삭제)
-- ---------------------------------------------------------------------
create table if not exists public.study_mate_lookup_failures (
  id         bigint      generated always as identity primary key,
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);

create index if not exists sm_lookup_failures_ip_idx      on public.study_mate_lookup_failures (ip_hash, created_at);
create index if not exists sm_lookup_failures_created_idx on public.study_mate_lookup_failures (created_at);

alter table public.study_mate_lookup_failures enable row level security;
revoke all on table public.study_mate_lookup_failures from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 함수 갱신 (setup.sql 과 같은 내용)
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- 4. 함수 실행 권한
-- ---------------------------------------------------------------------
revoke all on function public.sm_generate_confirmation_code()                from public, anon, authenticated;
revoke all on function public.sm_profile_type(integer, integer, integer)     from public, anon, authenticated;
revoke all on function public.sm_slots_full(public.study_mate_settings)      from public, anon, authenticated;

revoke all on function public.sm_get_application_status()  from public;
revoke all on function public.sm_submit_application(jsonb) from public;
revoke all on function public.sm_lookup_match(text)        from public;
grant execute on function public.sm_get_application_status()  to anon, authenticated;
grant execute on function public.sm_submit_application(jsonb) to anon, authenticated;
grant execute on function public.sm_lookup_match(text)        to anon, authenticated;

revoke all on function public.sm_admin_delete_event_data(text) from public, anon;
grant execute on function public.sm_admin_delete_event_data(text) to authenticated;
