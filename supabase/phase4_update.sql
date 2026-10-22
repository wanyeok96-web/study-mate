-- =====================================================================
-- STUDY MATE - 4차 업데이트 SQL (phase4_update.sql) : 동아리 축제 그룹(A/B)
-- ---------------------------------------------------------------------
-- 대상: 3차 버전(setup.sql 또는 phase3_update.sql)을 이미 실행한 Supabase 프로젝트
--       (새 프로젝트는 이 파일 대신 최신 setup.sql 하나만 실행하면 됩니다)
--
-- 배경
--   동아리 축제는 A그룹(부스 09:10~10:15) / B그룹(부스 10:25~11:30)으로 나뉘어
--   각 그룹은 자기 부스를 운영하지 않는 시간에만 STUDY MATE 에 참여할 수 있습니다.
--     A그룹 → 10:25~11:30 참여 / B그룹 → 09:10~10:15 참여
--
-- 바뀌는 내용
--   1) 신청 시 동아리 그룹(clubGroup: 'A' | 'B') 필수 입력 + 저장 (participants.club_group)
--   2) 소개팅 타임을 그룹별 15분 × 4개씩 총 8개로 변경
--        B1 09:10~09:25 / B2 09:25~09:40 / B3 09:40~09:55 / B4 09:55~10:10  (B그룹 전용)
--        A1 10:25~10:40 / A2 10:40~10:55 / A3 10:55~11:10 / A4 11:10~11:25  (A그룹 전용)
--      타임 id 첫 글자 = 참여 가능한 그룹 (sm_slot_group)
--   3) 팀 확정: 구성원이 모두 같은 그룹이어야 하고(SM_CLUB_GROUP_MISMATCH),
--      그 그룹의 타임에만 배정 가능(SM_SLOT_GROUP_MISMATCH). 타임 변경도 같은 규칙
--   4) 타임 마감 판단을 그룹별로: 상태 조회에 slotsFullByGroup {A, B} 추가,
--      slotsFull 은 두 그룹이 모두 마감일 때 true. 신청은 '내 그룹' 타임 기준으로 마감
--   5) 관리자 대시보드 참가자 정보에 clubGroup 추가
--
-- 사용 방법
--   1) Supabase 대시보드 > SQL Editor > New query → 이 파일 전체 붙여넣기 → [Run]
--   2) 그다음 새 script.js / index.html / style.css 를 배포(GitHub 에 올리기)하세요.
--      ⚠️ 순서가 바뀌면(화면 먼저 배포) 신청이 '동아리 그룹 없음'으로 저장되거나 오류가 납니다.
--   3) "예전 타임에 배정된 팀이 있습니다" 오류가 나면 관리자 화면에서 팀을 해체하거나,
--      리허설 데이터라면 아래 [리허설 데이터 정리]를 먼저 실행한 뒤 다시 실행하세요.
--   여러 번 실행해도 안전합니다.
--
-- [리허설 데이터 정리] (⚠️ 참가자·팀 데이터가 모두 삭제됩니다)
--   delete from public.study_mate_participants where true;
--   delete from public.study_mate_matches where true;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 사전 점검: 새 타임 목록에 없는 타임을 쓰는 팀이 있으면 아무것도 바꾸지 않고 중단
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.study_mate_matches
    where status <> 'cancelled'
      and time_slot is not null
      and not (time_slot = any (array['B1','B2','B3','B4','A1','A2','A3','A4']))
  ) then
    raise exception '예전 타임에 배정된 팀이 있습니다. 관리자 화면에서 팀을 해체하거나 파일 맨 위 [리허설 데이터 정리] 안내를 확인하세요.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. 운영 설정: 타임 8개 + 운영 시간
-- ---------------------------------------------------------------------
alter table public.study_mate_settings
  alter column time_slot_ids  set default array['B1','B2','B3','B4','A1','A2','A3','A4'],
  alter column matching_start set default time '09:10',
  alter column matching_end   set default time '11:30';

update public.study_mate_settings
set time_slot_ids  = array['B1','B2','B3','B4','A1','A2','A3','A4'],
    matching_start = time '09:10',
    matching_end   = time '11:30'
where id = 1;

-- ---------------------------------------------------------------------
-- 2. 참가자: 동아리 그룹 컬럼
--    기존 행이 없으면 NOT NULL 까지 적용, 있으면 그 행은 '그룹 정보 없음'으로 남음(매칭 불가)
-- ---------------------------------------------------------------------
alter table public.study_mate_participants add column if not exists club_group text;
alter table public.study_mate_participants drop constraint if exists sm_participants_club_group;
alter table public.study_mate_participants
  add constraint sm_participants_club_group check (club_group in ('A','B'));

do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing from public.study_mate_participants where club_group is null;
  if v_missing = 0 then
    alter table public.study_mate_participants alter column club_group set not null;
  else
    raise notice '동아리 그룹이 없는 기존 신청 %건이 있습니다. 관리자 화면에 "동아리 그룹 정보가 없음"으로 표시되며 매칭할 수 없습니다.', v_missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. 함수
-- ---------------------------------------------------------------------

-- 4-8. 타임 id → 참여 가능한 동아리 그룹 (id 첫 글자. 'A1' → 'A', 'B3' → 'B')
create or replace function public.sm_slot_group(p_slot text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when left(p_slot, 1) in ('A','B') then left(p_slot, 1) end;
$$;

-- 4-7. 그 동아리 그룹이 새 신청을 받을 타임 여유가 없는지
--      그 그룹의 빈 타임이 0개이거나, (그 그룹 대기자 + 새 신청 1명)이 남은 타임 × 최대 팀 인원보다 많으면 true
create or replace function public.sm_slots_full(s public.study_mate_settings, p_club_group text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_free_slots integer;
  v_waiting    integer;
begin
  select count(*) into v_free_slots
  from unnest(s.time_slot_ids) as t(slot_id)
  where public.sm_slot_group(t.slot_id) = p_club_group
    and not exists (
      select 1 from public.study_mate_matches m
      where m.time_slot = t.slot_id and m.status <> 'cancelled'
    );
  if v_free_slots <= 0 then
    return true;
  end if;

  select count(*) into v_waiting
  from public.study_mate_participants
  where status = 'waiting' and club_group = p_club_group;
  return v_waiting + 1 > v_free_slots * s.max_group_size;
end;
$$;

-- ---------------------------------------------------------------------
-- 5-1. 신청 가능 여부 / 인원 수 (+ 동아리 그룹별 타임 마감 여부)
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
  v_full_a     boolean;
  v_full_b     boolean;
begin
  select * into s from public.study_mate_settings where id = 1;

  select count(*) into v_active
  from public.study_mate_participants
  where status <> 'cancelled';

  select count(*) into v_used_slots
  from public.study_mate_matches
  where time_slot is not null and status <> 'cancelled';

  v_full_a := public.sm_slots_full(s, 'A');
  v_full_b := public.sm_slots_full(s, 'B');

  return jsonb_build_object(
    'applicationsOpen',   s.applications_open,
    'currentApplicants',  v_active,
    'maxParticipants',    s.max_participants,
    'remainingCapacity',  greatest(s.max_participants - v_active, 0),
    'remainingTimeSlots', greatest(coalesce(array_length(s.time_slot_ids, 1), 0) - v_used_slots, 0),
    'slotsFull',          v_full_a and v_full_b,
    'slotsFullByGroup',   jsonb_build_object('A', v_full_a, 'B', v_full_b)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5-2. 신청 저장 + 확인코드 발급 (모든 값 서버에서 재검증)
--      오류 코드(메시지): SM_INVALID / SM_CLOSED / SM_FULL / SM_SLOTS_FULL / SM_DUPLICATE
--      clubGroup: 'A' | 'B' 필수 → 그 그룹 타임 기준으로 마감 판단
--      studyProfile 은 최종 계산값만 받습니다 (원본 16문항 응답은 받지 않음)
--      동시성: 신청 잠금 → 팀 확정 잠금 순서로 잡아 (행사 데이터 삭제와 같은 순서)
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
  v_club_group     text;
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
  v_club_group     := coalesce(p_payload ->> 'clubGroup', '');
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
     or v_club_group not in ('A','B')
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

  -- 타임: 내 동아리 그룹의 타임이 모두 배정되었거나 남은 타임으로 더 받을 수 없으면 마감
  if public.sm_slots_full(s, v_club_group) then
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
    profile_id, student_number, name, phone, gender, grade, club_group,
    preferred_gender, preferred_grade, study_profile_json, profile_type,
    confirmation_code, status
  ) values (
    nullif(v_profile_id, ''), v_student_number, v_name, v_phone, v_gender, v_grade_text::integer, v_club_group,
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
        'clubGroup',        p.club_group,
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
-- 6-3. 팀 확정 + 타임 배정 (프론트 검증과 별개로 서버에서 다시 검증)
--      오류: SM_DUPLICATE_MEMBER / SM_GROUP_SIZE / SM_SLOT_INVALID / SM_MEMBER_NOT_FOUND
--            SM_MEMBER_NOT_WAITING / SM_CLUB_GROUP_MISMATCH / SM_SLOT_GROUP_MISMATCH
--            SM_HARD_FILTER / SM_SLOT_TAKEN
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
  v_group_count integer;
  v_no_group    integer;
  v_club_group  text;
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

  -- 동아리 그룹: 모두 같은 그룹 + 그 그룹이 참여할 수 있는 타임
  select count(distinct club_group), count(*) filter (where club_group is null), min(club_group)
    into v_group_count, v_no_group, v_club_group
  from public.study_mate_participants
  where id = any (v_ids);
  if v_group_count <> 1 or v_no_group > 0 then
    raise exception 'SM_CLUB_GROUP_MISMATCH';
  end if;
  if public.sm_slot_group(p_time_slot) is distinct from v_club_group then
    raise exception 'SM_SLOT_GROUP_MISMATCH';
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
-- 6-5. 팀 타임 변경 (빈 타임 + 팀 동아리 그룹의 타임으로만)
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

  if exists (
    select 1 from public.study_mate_participants
    where id = any (v_match.member_ids)
      and club_group is distinct from public.sm_slot_group(p_time_slot)
  ) then
    raise exception 'SM_SLOT_GROUP_MISMATCH';
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

-- 예전 타임 마감 함수(그룹 구분 없음) 삭제 → 위 함수들은 모두 그룹별 sm_slots_full 사용
drop function if exists public.sm_slots_full(public.study_mate_settings);

-- ---------------------------------------------------------------------
-- 4. 함수 실행 권한
-- ---------------------------------------------------------------------
revoke all on function public.sm_slot_group(text)                             from public, anon, authenticated;
revoke all on function public.sm_slots_full(public.study_mate_settings, text) from public, anon, authenticated;

revoke all on function public.sm_get_application_status()  from public;
revoke all on function public.sm_submit_application(jsonb) from public;
grant execute on function public.sm_get_application_status()  to anon, authenticated;
grant execute on function public.sm_submit_application(jsonb) to anon, authenticated;

revoke all on function public.sm_admin_get_dashboard()                            from public, anon;
revoke all on function public.sm_admin_create_match(uuid[], text, numeric, jsonb) from public, anon;
revoke all on function public.sm_admin_assign_time_slot(uuid, text)               from public, anon;
grant execute on function public.sm_admin_get_dashboard()                            to authenticated;
grant execute on function public.sm_admin_create_match(uuid[], text, numeric, jsonb) to authenticated;
grant execute on function public.sm_admin_assign_time_slot(uuid, text)               to authenticated;
