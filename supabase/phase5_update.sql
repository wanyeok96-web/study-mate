-- =====================================================================
-- STUDY MATE - 5차 업데이트 SQL (phase5_update.sql) : 신청 시작 시각(선착순 오픈)
-- ---------------------------------------------------------------------
-- 대상: 4차(phase4_update.sql 또는 최신 setup.sql)까지 실행한 Supabase 프로젝트
--
-- 바뀌는 내용
--   1) 운영 설정에 신청 시작 시각(applications_open_at) 추가 → 2026-10-22 18:00 (한국 시간)
--   2) 그 시각 전에는 서버가 신청을 거절 (SM_NOT_YET_OPEN). 서버 시간 기준이라 학생 기기 시계로 우회 불가
--   3) 상태 조회에 applicationsOpenAt / notYetOpen 추가, 관리자 대시보드 설정에 applicationsOpenAt 추가
--   ※ STUDY STYLE TEST 와 확인코드 조회는 시각과 관계없이 계속 이용 가능
--
-- 사용 방법
--   1) Supabase 대시보드 > SQL Editor > New query → 이 파일 전체 붙여넣기 → [Run]
--   2) 그다음 새 script.js 를 배포(GitHub 에 올리기)하세요.
--   여러 번 실행해도 안전합니다.
--
-- 시작 시각을 바꾸려면 (예: 18:30)
--   update public.study_mate_settings set applications_open_at = timestamptz '2026-10-22 18:30:00+09' where id = 1;
-- 시간 제한을 없애려면 (바로 신청 가능)
--   update public.study_mate_settings set applications_open_at = null where id = 1;
-- =====================================================================

alter table public.study_mate_settings add column if not exists applications_open_at timestamptz;

update public.study_mate_settings
set applications_open_at = timestamptz '2026-10-22 18:00:00+09'
where id = 1;

-- ---------------------------------------------------------------------
-- 5-1. 신청 가능 여부 / 인원 수 (+ 동아리 그룹별 타임 마감 여부 + 신청 시작 시각)
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
    'applicationsOpenAt', s.applications_open_at,
    'notYetOpen',         coalesce(now() < s.applications_open_at, false),
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
--      오류 코드(메시지): SM_INVALID / SM_NOT_YET_OPEN / SM_CLOSED / SM_FULL / SM_SLOTS_FULL / SM_DUPLICATE
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

  -- 신청 시작 시각 전이면 거절 (서버 시간 기준)
  if s.applications_open_at is not null and now() < s.applications_open_at then
    raise exception 'SM_NOT_YET_OPEN';
  end if;

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
        'applicationsOpen',   applications_open,
        'applicationsOpenAt', applications_open_at,
        'maxParticipants',    max_participants,
        'eventDate',          event_date,
        'minGroupSize',       min_group_size,
        'maxGroupSize',       max_group_size,
        'timeSlotIds',        to_jsonb(time_slot_ids)
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
-- 함수 실행 권한 (create or replace 는 기존 권한을 유지하지만 한 번 더 명시)
-- ---------------------------------------------------------------------
revoke all on function public.sm_get_application_status()  from public;
revoke all on function public.sm_submit_application(jsonb) from public;
grant execute on function public.sm_get_application_status()  to anon, authenticated;
grant execute on function public.sm_submit_application(jsonb) to anon, authenticated;

revoke all on function public.sm_admin_get_dashboard() from public, anon;
grant execute on function public.sm_admin_get_dashboard() to authenticated;
