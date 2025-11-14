const cheerio = require('cheerio');
const cyberClient = require('../http/cyberClient');

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

function formatAttendDt(attendDt) {
  if (!attendDt || attendDt.length !== 8) {
    return getTodayString();
  }
  const yyyy = attendDt.slice(0, 4);
  const mm = attendDt.slice(4, 6);
  const dd = attendDt.slice(6, 8);
  return `${yyyy}.${mm}.${dd}`;
}

function getNowYyyyMmDdHmmPlus9Hours30Minutes() {
  const now = new Date();
  now.setHours(now.getHours() + 9); // 9시간 추가
  now.setMinutes(now.getMinutes() + 30); // 30분 추가
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}`;
}

function parseYyyyMmDd(str) {
  const yyyy = parseInt(str.slice(0, 4), 10);
  const mm = parseInt(str.slice(4, 6), 10) - 1;
  const dd = parseInt(str.slice(6, 8), 10);
  return new Date(yyyy, mm, dd);
}

function getCurrentWeek(semesterStart) {
  if (!semesterStart) {
    throw new Error('CYBER_SEMESTER_START(.env)에 학기 시작일(YYYYMMDD)이 설정되어 있지 않습니다.');
  }

  const start = parseYyyyMmDd(semesterStart);
  const today = new Date();

  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffMs = today - start;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;

  const MAX_WEEK = 16;
  if (week < 1) return 1;
  if (week > MAX_WEEK) return MAX_WEEK;
  return week;
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

async function loadWeekAttendCandidates(week) {
  const listHtml = await cyberClient.fetchWeekAttendanceListHtml(week);
  const $ = cheerio.load(listHtml);
  const candidates = [];

  $('*[attend_no]').each(function () {
    const $el = $(this);
    const attendNo = $el.attr('attend_no');
    const attendDt = $el.attr('attend_dt');

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

async function getTodayAttendNo(semesterStart) {
  const todayNoDot = getTodayNoDotString();
  const todayPretty = getTodayString();

  const formPageRes = await cyberClient.fetchAttendanceListForm();
  console.log('📂 출석 탭 응답 status:', formPageRes.status);

  const currentWeek = getCurrentWeek(semesterStart);
  console.log(`📆 오늘은 학기 기준 ${currentWeek}주차로 계산되었습니다.`);

  const candidates = await loadWeekAttendCandidates(currentWeek);

  if (candidates.length === 0) {
    throw new Error(`${currentWeek}주차에서 attend_no attribute 를 가진 요소를 찾지 못했습니다.`);
  }

  const todayCandidate = candidates.find((c) => c.attendDt && c.attendDt === todayNoDot);

  if (todayCandidate) {
    console.log(
      `✅ 오늘(${todayPretty}, ${todayNoDot})에 해당하는 ATTEND_NO:`,
      todayCandidate.attendNo,
      `(weekNo=${todayCandidate.weekNo})`
    );
    return todayCandidate.attendNo;
  }

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

async function getLateAndAbsentStudents(attendNo) {
  const formHtml = await cyberClient.fetchAttendanceUpdateFormHtml(attendNo);

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
    throw new Error('weekNo/weekTime/ATTEND_DT 를 form HTML에서 찾지 못했습니다.');
  }

  const listHtml = await cyberClient.fetchAttendanceUpdateListHtml({
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
  });

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

    if (statusValue === '1') return;

    let statusKor = '';
    if (statusValue === '3') statusKor = '지각';
    else if (statusValue === '2') statusKor = '결석';
    else statusKor = `기타(${statusValue})`;

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
    attendDt,
  };
}

async function postNotice({ students, attendDt, config }) {
  await cyberClient.enterNoticePage();
  await cyberClient.openNoticeWriteForm();

  const subject = `${formatAttendDt(attendDt)} 출석`;
  const contentHtml = buildNoticeContentByStatus(students);
  const openDt = getNowYyyyMmDdHmmPlus9Hours30Minutes();

  const responseText = await cyberClient.submitNoticeRequest({
    ud: config.userId,
    ky: config.courseKey,
    returnData: 'json',
    SBJT: subject,
    REG_NM: config.noticeRegName,
    OPEN_ST_DT: openDt,
    cosubject: '',
    TXT: contentHtml,
    NOTICE_DV: '1',
    NOTICE_ED_DT: '99991231',
    ONLINE_SEQ: '',
    FILE_SEQS: '',
    EDITOR_SEQS: '',
    encoding: 'utf-8',
  });

  console.log('📨 공지 등록 응답:', responseText);
}

function validateConfig(config) {
  const required = [
    { key: 'userId', env: 'CYBER_ID' },
    { key: 'userPw', env: 'CYBER_PW' },
    { key: 'courseKey', env: 'CYBER_KJ_KEY' },
    { key: 'semesterStart', env: 'CYBER_SEMESTER_START' },
    { key: 'noticeRegName', env: 'CYBER_NOTICE_REG_NAME' },
  ];

  const missing = required.filter((item) => !config[item.key]);
  if (missing.length > 0) {
    const envList = missing.map((m) => m.env).join(', ');
    throw new Error(`.env에 ${envList} 값이 설정되어 있어야 합니다.`);
  }
}

async function run(config) {
  validateConfig(config);

  await cyberClient.loginCyberCampus({
    userId: config.userId,
    userPw: config.userPw,
  });

  await cyberClient.enterCourseRoom(config.courseKey);

  const attendNo = await getTodayAttendNo(config.semesterStart);
  const { students, attendDt } = await getLateAndAbsentStudents(attendNo);

  console.log('📊 지각/결석자 목록');
  console.log(JSON.stringify(students, null, 2));
  console.log('📅 출석 날짜 (attendDt):', attendDt);

  await postNotice({ students, attendDt, config });
}

module.exports = {
  run,
};

