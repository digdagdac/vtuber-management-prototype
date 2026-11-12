# 구현과 검증 범위

2026-11-12 포트폴리오 준비 시점 기준입니다.

## 규칙 검사

| 파일 | 확인한 수 | 중심 내용 |
| --- | ---: | --- |
| verify-core.cjs | 45 | 일정, 성장, 사건, 미니게임, 저장, 40분기 진행 |
| verify-career.cjs | 10 | 후속 반응, 예산, 제안, 손상 저장과 중복 처리 |
| verify-production.cjs | 8 | 평가, 프로그램, 제작 경험과 저장 호환 |
| verify-workshop.cjs | 10 | 제작 기여, 중간 방침, 적자, 애드리브, 편집, 진행 |
| 합계 | 73 | 규칙·상태 검사 |

```sh
npm test
```

## 브라우저 검사

verify-workshop-browser.cjs에서 12개 검사를 수행합니다. 세 방송 주제의 제작→방송→결과, 3편 연속 진행, 제작 중 재접속, 애드리브 1회, 적자 상태의 무료 진행, 기존 저장 호환, 실제 타이머, 비교판의 독립 저장을 확인합니다.

PC 1280×720 / 1366×768 / 1920×1080을 검사했습니다. 페이지·콘솔 오류도 확인합니다.

```sh
npm install
npx playwright install chromium
npm run test:browser
```

Playwright를 다른 위치에 설치했다면 VT_PLAYWRIGHT 환경변수로 모듈 경로를 지정할 수 있습니다. 검사 결과와 캡처는 prototype/qa 및 prototype/output에 생성되며 기본적으로 커밋하지 않습니다.

## 실행 코드와 공개 사본

게임의 core.js, career.js, workshop.js, app.js는 원본 실행판에서 복사한 파일입니다. 공개 정리 과정에서는 문서·실행 안내·패키지 명령·테스트의 환경 의존 경로만 정리합니다. 기획 당시의 가설 문서를 현재 구현 완료 기능처럼 보이지 않게 따로 요약했습니다.

## 이 검사로 말할 수 있는 것

상태 전이·보상·진행·저장과 해당 화면 시나리오가 동작하는지 확인했습니다. 외부 사용자 대상 재미 검증, 실제 모바일 기기 검증, 장기 밸런스 선호나 시장성은 별도 과제입니다.

README의 화면은 2026-10-25 보존 캡처이며 신규 사용자 테스트 결과가 아닙니다.

## 이번 공개 사본에서 다시 실행한 기록

아래 JSON에는 실행 시각과 통과한 검사 항목을 보존했습니다.

- [핵심 규칙 45개](evidence/core-results.json)
- [후속 반응 10개](evidence/career-results.json)
- [제작·평가 8개](evidence/production-results.json)
- [방송 제작 10개](evidence/workshop-results.json)
- [브라우저 12개](evidence/workshop-browser-results.json)
