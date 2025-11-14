## n8n 프로세스
```
[클라이언트 버튼 클릭]
        ↓
[n8n Webhook Trigger]
        ↓ (POST)
[n8n HTTP Request Node]
        ↓ (POST /run-lms)
[Railway Node.js Server]
        ↓
[사이버캠퍼스 로그인 → 출석 정보 수집]
        ↓
[공지 자동 작성]
        ↓
완료
```

## 로컬에서 사용법

1. 환경 설정
```shell
npm i
```

2. env 파일 설정
```shell
CYBER_ID=lmsID
CYBER_PW=lmsPW
CYBER_KJ_KEY=강의실KJ
CYBER_SEMESTER_START=20250901
CYBER_NOTICE_REG_NAME=한글이름세글자
```

3. 실행
```shell
node lms.js
```