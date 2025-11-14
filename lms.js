if (typeof File === 'undefined') {
  global.File = class {};
}

require('dotenv').config();

const { run } = require('./src/logic/noticeManager');

const config = {
  userId: process.env.CYBER_ID,
  userPw: process.env.CYBER_PW,
  courseKey: process.env.CYBER_KJ_KEY,
  semesterStart: process.env.CYBER_SEMESTER_START,
  noticeRegName: process.env.CYBER_NOTICE_REG_NAME,
};

run(config)
  .then(() => {
    console.log('✅ 작업 완료');
  })
  .catch((err) => {
    console.error('❌ 오류 발생:', err.message);
    process.exit(1);
  });
