// server.js
require('dotenv').config();
const express = require('express');
const { run } = require('./src/logic/noticeManager');

const app = express();
app.use(express.json());

app.post('/run-lms', async (req, res) => {
  try {
    const config = {
      userId: process.env.CYBER_ID,
      userPw: process.env.CYBER_PW,
      courseKey: process.env.CYBER_KJ_KEY,
      semesterStart: process.env.CYBER_SEMESTER_START,
      noticeRegName: process.env.CYBER_NOTICE_REG_NAME,
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
