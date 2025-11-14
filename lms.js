// cyber-attendance.js
// 사이버캠퍼스에서 오늘 차시의 지각/결석자만 뽑아오는 스크립트 (Node 18 + node-fetch2 버전)

// undici / fetch 가 기대하는 전역 File 폴리필
if (typeof File === 'undefined') {
  global.File = class {};
}

require('dotenv').config();

const tough = require('tough-cookie');
const nodeFetch = require('node-fetch');
const cheerio = require('cheerio');
const fetchCookie = require('fetch-cookie');

// 쿠키 관리용 fetch
const jar = new tough.CookieJar();
const fetch = fetchCookie(nodeFetch, jar);

const BASE_URL = 'https://cyber.sogang.ac.kr';
const LOGIN_URL = BASE_URL + '/ilos/lo/login.acl';

const LIST_FORM_URL = BASE_URL + '/ilos/cls/pf/attend/attendance_list_form.acl';
const LIST_DATA_URL = BASE_URL + '/ilos/cls/pf/attend/attendance_list.acl';
const UPDATE_URL = BASE_URL + '/ilos/cls/pf/attend/attendance_update_form.acl';
const UPDATE_LIST_URL = BASE_URL + '/ilos/cls/pf/attend/attendance_update_list.acl';
const SUBMAIN_URL = BASE_URL + '/ilos/cls/pf/submain/submain_form.acl';
const ASSIST_ROOM_URL = BASE_URL + '/ilos/cls/st/co/eclass_assist_room.acl';
const NOTICE_URL = BASE_URL + '/ilos/cls/pf/notice/notice_list_form.acl';
const NOTICE_INSERT_POP_URL = BASE_URL + '/ilos/cls/pf/notice/notice_insert_pop.acl';
const NOTICE_INSERT_URL = BASE_URL + '/ilos/cls/pf/notice/notice_insert.acl';

const USER_ID = process.env.CYBER_ID;
const USER_PW = process.env.CYBER_PW;
const COURSE_KEY = process.env.CYBER_KJ_KEY;
const SEMESTER_START = process.env.CYBER_SEMESTER_START; // YYYYMMDD
const NOTICE_REG_NAME = process.env.CYBER_NOTICE_REG_NAME; // 예: 송은수

let latestLateAndAbsent = [];
let latestAttendDt = null;

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function getTodayNoDotString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// yyyyMMdd → yyyy.mm.dd
function formatAttendDt(attendDt) {
  if (!attendDt || attendDt.length !== 8) {
    return getTodayString(); // 기본값으로 오늘 날짜 반환
  }
  const yyyy = attendDt.slice(0, 4);
  const mm = attendDt.slice(4, 6);
  const dd = attendDt.slice(6, 8);
  return `${yyyy}.${mm}.${dd}`;
}

function getNowYyyyMmDdHmm() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30); // 현재 시간 + 30분
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}`;
}

function buildNoticeContentByStatus(students) {
  if (!students || students.length === 0) {
    return '<p>지각/결석자가 없습니다.</p>';
  }

  const groups = students.reduce((acc, item) => {
    const key = item.statusText || '기타';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item.studentId);
    return acc;
  }, {});

  const preferredOrder = ['결석', '지각'];
  const orderedStatuses = [
    ...preferredOrder.filter((status) => groups[status]),
    ...Object.keys(groups).filter((status) => !preferredOrder.includes(status)),
  ];

  return orderedStatuses
    .map((status) => {
      const ids = groups[status]
        .map((studentId) => `<div style="padding: 4px 8px; border-bottom: 1px solid #e8e8e8;">${studentId}</div>`)
        .join('');
      return `<div style="margin-bottom: 16px;"><h3 style="margin: 0 0 6px 0; padding: 6px 8px; background-color: #f5f5f5; border-left: 4px solid #4a90e2; font-size: 16px; font-weight: bold;">${status}</h3><div style="background-color: #fafafa; border-radius: 4px; overflow: hidden;">${ids}</div></div>`;
    })
    .join('');
}

// YYYYMMDD → Date
function parseYyyyMmDd(str) {
  const yyyy = parseInt(str.slice(0, 4), 10);
  const mm = parseInt(str.slice(4, 6), 10) - 1;
  const dd = parseInt(str.slice(6, 8), 10);
  return new Date(yyyy, mm, dd);
}

// 학기 시작일 기준으로 현재 주차 계산
function getCurrentWeek() {
  if (!SEMESTER_START) {
    throw new Error('CYBER_SEMESTER_START(.env)에 학기 시작일(YYYYMMDD)이 설정되어 있지 않습니다.');
  }

  const start = parseYyyyMmDd(SEMESTER_START);
  const today = new Date();

  // 시/분/초 영향 제거
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = today - start;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1; // 0~6일 → 1주차

  // 1주차 미만, 16주차 초과하는 경우도 일단 1~16 사이로 클램핑
  const MAX_WEEK = 16;
  if (week < 1) return 1;
  if (week > MAX_WEEK) return MAX_WEEK;
  return week;
}

/**
 * 1. 로그인
 */
async function loginCyberCampus() {
  const form = new URLSearchParams();
  form.append('returnURL', '');
  form.append('challenge', '');
  form.append('response', '');
  form.append('auto_login', 'N');
  form.append('usr_id', USER_ID);
  form.append('usr_pwd', USER_PW);

  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': BASE_URL,
      'Referer': BASE_URL + '/ilos/main/member/login_form.acl',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body: form.toString(),
    redirect: 'manual',
  });

  console.log('✅ 로그인 요청 status:', res.status);
}

async function enterCourseRoom() {
  if (!COURSE_KEY) {
    throw new Error('CYBER_KJ_KEY(.env)에 과목 KJ_KEY가 설정되어 있지 않습니다.');
  }

  const form = new URLSearchParams({
    KJKEY: COURSE_KEY,
  }).toString();

  console.log('🧑‍🏫 조교 강의실 입장 요청:', ASSIST_ROOM_URL, 'KJKEY=', COURSE_KEY);

  const res = await fetch(ASSIST_ROOM_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': BASE_URL,
      'Referer': BASE_URL + '/ilos/main/main_form.acl',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body: form,
    redirect: 'follow',
  });

  console.log('🧑‍🏫 조교 강의실 입장 응답 status:', res.status);
}

/**
 * 특정 주차의 attend_no 리스트 로드
 */
async function loadWeekAttendCandidates(week) {
  console.log(`🔎 ${week}주차 출석 리스트 요청:`, LIST_DATA_URL);

  const body = new URLSearchParams({
    SCH_WEEK_NO: String(week),
    encoding: 'utf-8',
  }).toString();

  const listRes = await fetch(LIST_DATA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'text/html, */*;q=0.1',
      'Referer': LIST_FORM_URL,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body,
  });

  const listHtml = await listRes.text();
  const $ = cheerio.load(listHtml);

  const candidates = [];

  $('*[attend_no]').each(function () {
    const $el = $(this);
    const attendNo = $el.attr('attend_no');
    const attendDt = $el.attr('attend_dt'); // yyyyMMdd (있을 수도, 없을 수도)

    if (!attendNo) return;

    candidates.push({
      attendNo: attendNo.trim(),
      attendDt: attendDt ? attendDt.trim() : null,
      weekNo: week,
    });
  });

  console.log(
    candidates.length > 0
      ? `✅ ${week}주차에서 attend_no 를 ${candidates.length}개 찾았습니다.`
      : `ℹ️ ${week}주차에서는 attend_no 가 없습니다.`
  );

  return candidates;
}

/**
 * 2. 출결 전체 탭에서 오늘 차시의 ATTEND_NO 찾기
 *    → 학기 시작일 기준 "이번 주차"만 조회
 */
async function getTodayAttendNo() {
  const todayNoDot = getTodayNoDotString();
  const todayPretty = getTodayString();

  // 0) 출석 탭 한 번 진입
  console.log('📂 출석 탭 진입:', LIST_FORM_URL);
  const formPageRes = await fetch(LIST_FORM_URL, {
    method: 'GET',
    headers: {
      'Referer': SUBMAIN_URL,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
  });
  console.log('📂 출석 탭 응답 status:', formPageRes.status);

  const currentWeek = getCurrentWeek();
  console.log(`📆 오늘은 학기 기준 ${currentWeek}주차로 계산되었습니다.`);

  const candidates = await loadWeekAttendCandidates(currentWeek);

  if (candidates.length === 0) {
    throw new Error(
      `${currentWeek}주차에서 attend_no attribute 를 가진 요소를 찾지 못했습니다.`
    );
  }

  // 1️⃣ 오늘 날짜(attend_dt == yyyyMMdd)인 항목 우선 선택
  const todayCandidate = candidates.find(
    (c) => c.attendDt && c.attendDt === todayNoDot
  );

  if (todayCandidate) {
    console.log(
      `✅ 오늘(${todayPretty}, ${todayNoDot})에 해당하는 ATTEND_NO:`,
      todayCandidate.attendNo,
      `(weekNo=${todayCandidate.weekNo})`
    );
    return todayCandidate.attendNo;
  }

  // 2️⃣ 오늘 날짜가 없으면: 이 주차에서 가장 최근 차시라고 보고 가장 큰 attendNo 사용
  const nums = candidates
    .map((c) => parseInt(c.attendNo, 10))
    .filter((n) => !isNaN(n));

  if (nums.length === 0) {
    throw new Error('attend_no 값이 숫자가 아니라서 사용할 수 없습니다.');
  }

  const maxAttendNo = Math.max(...nums);
  console.log(
    `⚠️ ${currentWeek}주차에서 오늘 날짜(${todayNoDot})에 해당하는 attend_dt 가 없어, ` +
      `이 주차의 가장 큰 ATTEND_NO=${maxAttendNo} 를 사용합니다.`
  );
  return String(maxAttendNo);
}

/**
 * 3. 특정 ATTEND_NO 의 출결 상세에서 지각/결석만 추출
 */
async function getLateAndAbsentStudents(attendNo) {
  const formUrl = UPDATE_URL + '?ATTEND_NO=' + attendNo;

  const formRes = await fetch(formUrl, {
    method: 'GET',
    headers: {
      'Referer': LIST_FORM_URL,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
  });

  console.log('🧾 상세 폼 요청:', formUrl, 'status:', formRes.status);

  const formHtml = await formRes.text();

  const weekNoMatch = formHtml.match(/var\s+weekNo\s*=\s*"(\d+)"/);
  const weekTimeMatch = formHtml.match(/var\s+weekTime\s*=\s*"(\d+)"/);
  const supplyLectYnMatch = formHtml.match(/var\s+supplyLectYn\s*=\s*"([YN])"/);
  const attendDtMatch = formHtml.match(/ATTEND_DT\s*:\s*"(\d+)"/);

  const weekNo = weekNoMatch ? weekNoMatch[1] : null;
  const weekTime = weekTimeMatch ? weekTimeMatch[1] : null;
  const supplyLectYn = supplyLectYnMatch ? supplyLectYnMatch[1] : 'N';
  const attendDt = attendDtMatch ? attendDtMatch[1] : getTodayNoDotString();

  console.log('🔧 상세 설정:', {
    weekNo,
    weekTime,
    supplyLectYn,
    attendDt,
  });

  if (!weekNo || !weekTime || !attendDt) {
    throw new Error(
      'weekNo/weekTime/ATTEND_DT 를 form HTML에서 찾지 못했습니다.'
    );
  }

  const body = new URLSearchParams({
    ATTEND_NO: String(attendNo),
    WEEK_NO: weekNo,
    WEEK_TIME: weekTime,
    ATTEND_DT: attendDt,
    SUPPLY_LECT_YN: supplyLectYn,
    SCH_VAL: '',
    SCH_DIV: '',
    LECTURE_WEEKS: '',
    ODR: '',
    encoding: 'utf-8',
  }).toString();

  const listRes = await fetch(UPDATE_LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': formUrl,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body,
  });

  console.log('📥 상세 리스트 요청:', UPDATE_LIST_URL, 'status:', listRes.status);

  const listHtml = await listRes.text();

  const $ = cheerio.load(listHtml);
  const rows = $('.grid_row.attend_user');
  console.log('👥 학생 row 개수:', rows.length);

  const result = [];
  let totalSelectedButtons = 0;

  rows.each(function () {
    const $row = $(this);

    const rawId = $row.attr('data-id');
    const studentId = rawId ? rawId.trim() : null;
    if (!studentId) return;

    const selectedBtn = $row.find('.attend_div.selected').first();
    if (selectedBtn.length === 0) return;

    totalSelectedButtons += 1;

    const rawStatus = selectedBtn.attr('value');
    const statusValue = rawStatus ? rawStatus.trim() : null;
    if (!statusValue) return;

    if (statusValue === '1') return; // 출석은 제외

    let statusKor = '';
    if (statusValue === '3') statusKor = '지각';
    else if (statusValue === '2') statusKor = '결석';
    else statusKor = '기타(' + statusValue + ')';

    result.push({
      studentId,
      statusValue,
      statusText: statusKor,
    });
  });

  console.log('✅ 선택된 출결 버튼 개수(.attend_div.selected):', totalSelectedButtons);
  console.log('✅ 그 중 지각/결석 인원 수:', result.length);

  if (rows.length > 0 && totalSelectedButtons === 0) {
    console.warn(
      '⚠️ 학생 row는 있는데 .attend_div.selected가 하나도 없습니다. HTML 구조를 다시 확인해보세요.'
    );
  }

  return {
    students: result,
    attendDt: attendDt,
  };
}

/**
 * 공지 페이지 진입
 */
async function enterNotice() {
  console.log('📢 공지 페이지 진입:', NOTICE_URL);
  
  const res = await fetch(NOTICE_URL, {
    method: 'GET',
    headers: {
      'Referer': SUBMAIN_URL,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
  });
  
  console.log('📢 공지 페이지 응답 status:', res.status);
  
  return res;
}

/**
 * 공지 글쓰기 팝업 진입
 */
async function openNoticeWriteForm() {
  console.log('📝 공지 글쓰기 버튼 클릭(POST):', NOTICE_INSERT_POP_URL);

  const body = new URLSearchParams({
    encoding: 'utf-8',
  }).toString();

  const res = await fetch(NOTICE_INSERT_POP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': NOTICE_URL,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body,
  });

  console.log('📝 공지 글쓰기 응답 status:', res.status);
  return res;
}

/**
 * 공지 글쓰기 제출
 */
async function submitNotice() {
  if (!latestAttendDt) {
    throw new Error('공지 작성 전에 attendDt 가 설정되지 않았습니다.');
  }

  const subject = `${formatAttendDt(latestAttendDt)} 출석`;
  const contentHtml = buildNoticeContentByStatus(latestLateAndAbsent);
  const noticeType = '1';
  const closeDate = '99991231';

  if (!USER_ID || !COURSE_KEY || !NOTICE_REG_NAME) {
    throw new Error('공지 작성에 필요한 CYBER_ID/KJ_KEY/NOTICE_REG_NAME 환경변수가 설정되어 있지 않습니다.');
  }

  const openDt = getNowYyyyMmDdHmm();

  const body = new URLSearchParams({
    ud: USER_ID,
    ky: COURSE_KEY,
    returnData: 'json',
    SBJT: subject,
    REG_NM: NOTICE_REG_NAME,
    OPEN_ST_DT: openDt,
    cosubject: '',
    TXT: contentHtml,
    NOTICE_DV: noticeType,
    NOTICE_ED_DT: closeDate,
    ONLINE_SEQ: '',
    FILE_SEQS: '',
    EDITOR_SEQS: '',
    encoding: 'utf-8',
  }).toString();

  console.log('📨 공지 등록 요청:', NOTICE_INSERT_URL, '제목:', subject);

  const res = await fetch(NOTICE_INSERT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Referer': NOTICE_URL,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
    body,
  });

  console.log('📨 공지 등록 응답 status:', res.status);

  const text = await res.text();
  // console.log('📨 공지 등록 응답 body:', text);

  return text;
}

/**
 * 메인
 */
async function main() {
  try {
    await loginCyberCampus();
    await enterCourseRoom();

    const attendNo = await getTodayAttendNo();
    const { students: lateAndAbsent, attendDt } = await getLateAndAbsentStudents(attendNo);

    latestLateAndAbsent = lateAndAbsent;
    latestAttendDt = attendDt;

    console.log('📊 지각/결석자 목록');
    console.log(JSON.stringify(lateAndAbsent, null, 2));
    console.log('📅 출석 날짜 (attendDt):', attendDt);
    
    await enterNotice();
    await openNoticeWriteForm();
    await submitNotice();
  } catch (err) {
    console.error('❌ 오류 발생:', err.message);
    process.exit(1);
  }
}

main();
