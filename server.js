// server.js
require('dotenv').config();
const express = require('express');
const { run } = require('./src/logic/noticeManager');

const app = express();
app.use(express.json());

// name에 따른 courseKey 매핑
const COURSE_KEY_MAP = {
  '송은수': process.env.CYBER_KJ_KEY_SONG_EUNSU,
  '송지훈': process.env.CYBER_KJ_KEY_SONG_JIHOON,
  '이민석': process.env.CYBER_KJ_KEY_LEE_MINSEOK,
  '김민준': process.env.CYBER_KJ_KEY_KIM_MINJUN,
};

app.post('/run-lms', async (req, res) => {
  try {
    const { id, pw, name, content } = req.body;
    
    if (!id || !pw || !name) {
      return res.status(400).json({ 
        ok: false, 
        error: '요청 body에 id, pw, name이 필요합니다.' 
      });
    }

    const courseKey = COURSE_KEY_MAP[name];
    if (!courseKey) {
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
  }
});

// Railway는 기본적으로 process.env.PORT로 Listen해야 함
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
