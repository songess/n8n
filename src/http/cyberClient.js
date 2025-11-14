const tough = require('tough-cookie');
const nodeFetch = require('node-fetch');
const fetchCookie = require('fetch-cookie');

const BASE_URL = 'https://cyber.sogang.ac.kr';
const LOGIN_URL = `${BASE_URL}/ilos/lo/login.acl`;
const LIST_FORM_URL = `${BASE_URL}/ilos/cls/pf/attend/attendance_list_form.acl`;
const LIST_DATA_URL = `${BASE_URL}/ilos/cls/pf/attend/attendance_list.acl`;
const UPDATE_URL = `${BASE_URL}/ilos/cls/pf/attend/attendance_update_form.acl`;
const UPDATE_LIST_URL = `${BASE_URL}/ilos/cls/pf/attend/attendance_update_list.acl`;
const SUBMAIN_URL = `${BASE_URL}/ilos/cls/pf/submain/submain_form.acl`;
const ASSIST_ROOM_URL = `${BASE_URL}/ilos/cls/st/co/eclass_assist_room.acl`;
const NOTICE_URL = `${BASE_URL}/ilos/cls/pf/notice/notice_list_form.acl`;
const NOTICE_INSERT_POP_URL = `${BASE_URL}/ilos/cls/pf/notice/notice_insert_pop.acl`;
const NOTICE_INSERT_URL = `${BASE_URL}/ilos/cls/pf/notice/notice_insert.acl`;

const jar = new tough.CookieJar();
const fetch = fetchCookie(nodeFetch, jar);

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function buildHeaders(overrides = {}) {
  return {
    'User-Agent': DEFAULT_USER_AGENT,
    ...overrides,
  };
}

async function loginCyberCampus({ userId, userPw }) {
  const form = new URLSearchParams();
  form.append('returnURL', '');
  form.append('challenge', '');
  form.append('response', '');
  form.append('auto_login', 'N');
  form.append('usr_id', userId);
  form.append('usr_pwd', userPw);

  return fetch(LOGIN_URL, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/ilos/main/member/login_form.acl`,
    }),
    body: form.toString(),
    redirect: 'manual',
  });
}

async function enterCourseRoom(courseKey) {
  const form = new URLSearchParams({ KJKEY: courseKey }).toString();

  return fetch(ASSIST_ROOM_URL, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE_URL,
      Referer: `${BASE_URL}/ilos/main/main_form.acl`,
    }),
    body: form,
    redirect: 'follow',
  });
}

async function fetchAttendanceListForm() {
  return fetch(LIST_FORM_URL, {
    method: 'GET',
    headers: buildHeaders({
      Referer: SUBMAIN_URL,
    }),
  });
}

async function fetchWeekAttendanceListHtml(week) {
  const body = new URLSearchParams({
    SCH_WEEK_NO: String(week),
    encoding: 'utf-8',
  }).toString();

  const res = await fetch(LIST_DATA_URL, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'text/html, */*;q=0.1',
      Referer: LIST_FORM_URL,
    }),
    body,
  });

  return res.text();
}

async function fetchAttendanceUpdateFormHtml(attendNo) {
  const formUrl = `${UPDATE_URL}?ATTEND_NO=${attendNo}`;

  const res = await fetch(formUrl, {
    method: 'GET',
    headers: buildHeaders({
      Referer: LIST_FORM_URL,
    }),
  });

  return res.text();
}

async function fetchAttendanceUpdateListHtml(params) {
  const body = new URLSearchParams(params).toString();

  const res = await fetch(UPDATE_LIST_URL, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${UPDATE_URL}?ATTEND_NO=${params.ATTEND_NO}`,
    }),
    body,
  });

  return res.text();
}

async function enterNoticePage() {
  return fetch(NOTICE_URL, {
    method: 'GET',
    headers: buildHeaders({
      Referer: SUBMAIN_URL,
    }),
  });
}

async function openNoticeWriteForm() {
  const body = new URLSearchParams({
    encoding: 'utf-8',
  }).toString();

  return fetch(NOTICE_INSERT_POP_URL, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: NOTICE_URL,
      'X-Requested-With': 'XMLHttpRequest',
    }),
    body,
  });
}

async function submitNoticeRequest(bodyParams) {
  const body = new URLSearchParams(bodyParams).toString();

  const res = await fetch(NOTICE_INSERT_URL, {
    method: 'POST',
    headers: buildHeaders({
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: NOTICE_URL,
      'X-Requested-With': 'XMLHttpRequest',
    }),
    body,
  });

  return res.text();
}

module.exports = {
  loginCyberCampus,
  enterCourseRoom,
  fetchAttendanceListForm,
  fetchWeekAttendanceListHtml,
  fetchAttendanceUpdateFormHtml,
  fetchAttendanceUpdateListHtml,
  enterNoticePage,
  openNoticeWriteForm,
  submitNoticeRequest,
};

