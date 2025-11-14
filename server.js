// server.js
require('dotenv').config();
const express = require('express');
const { run } = require('./src/logic/noticeManager');

const app = express();
app.use(express.json());

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// name에 따른 courseKey 매핑
const COURSE_KEY_MAP = {
  '송은수': process.env.CYBER_KJ_KEY_SONG_EUNSU,
  '송지훈': process.env.CYBER_KJ_KEY_SONG_JIHOON,
  '이민석': process.env.CYBER_KJ_KEY_LEE_MINSEOK,
  '김민준': process.env.CYBER_KJ_KEY_KIM_MINJUN,
};

// 중복 실행 방지를 위한 락
let isRunning = false;

app.post('/run-lms', async (req, res) => {
  // 중복 실행 방지
  if (isRunning) {
    console.log('⚠️ 이미 실행 중인 요청이 있습니다. 요청을 무시합니다.');
    return res.status(429).json({ 
      ok: false, 
      error: '이미 실행 중인 요청이 있습니다. 잠시 후 다시 시도해주세요.' 
    });
  }

  try {
    isRunning = true;
    console.log('📥 요청 수신:', { name: req.body.name, id: req.body.id });

    const { id, pw, name, content } = req.body;
    
    if (!id || !pw || !name) {
      isRunning = false;
      return res.status(400).json({ 
        ok: false, 
        error: '요청 body에 id, pw, name이 필요합니다.' 
      });
    }

    const courseKey = COURSE_KEY_MAP[name];
    if (!courseKey) {
      isRunning = false;
      return res.status(400).json({ 
        ok: false, 
        error: `지원하지 않는 이름입니다. 가능한 이름: ${Object.keys(COURSE_KEY_MAP).join(', ')}` 
      });
    }

    const config = {
      userId: id,
      userPw: pw,
      courseKey: courseKey,
      semesterStart: process.env.CYBER_SEMESTER_START,
      noticeRegName: name,
      content: content || '', // content는 선택사항
    };

    await run(config);

    res.json({ ok: true, message: "LMS 공지 자동화 완료!" });
  } catch (err) {
    console.error("❌ 서버 오류:", err);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    isRunning = false;
    console.log('✅ 요청 처리 완료');
  }
});

// Railway는 기본적으로 process.env.PORT로 Listen해야 함
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
