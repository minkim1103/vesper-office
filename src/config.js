// 모든 설정은 환경변수로 받습니다. (Vercel → Project → Settings → Environment Variables)
import crypto from 'node:crypto';
import { applicationProfile } from './profile.js';
const profile = applicationProfile();

const env = process.env;

export const config = {
  profile,
  // iCloud 계정 (둘 다 비어 있으면 '데모 모드'로 동작)
  icloudUser: env.ICLOUD_USERNAME || '',          // Apple ID 이메일
  icloudPassword: env.ICLOUD_APP_PASSWORD || '',  // appleid.apple.com 에서 만든 "앱 암호"
  caldavRoot: env.CALDAV_URL || 'https://caldav.icloud.com/',

  // 웹앱 로그인 비밀번호
  appPassword: env.APP_PASSWORD || '',
  // Claude 연결용 비밀 토큰 (MCP 주소: https://<도메인>/mcp/<MCP_TOKEN>)
  mcpToken: env.MCP_TOKEN || '',

  // Google 캘린더 (선택) — README 의 'Google 캘린더 연결' 참고
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
  googleRefreshToken: env.GOOGLE_REFRESH_TOKEN || '',

  // Spaces(할 일)를 저장하는 iCloud 캘린더 이름 (없으면 자동 생성)
  vesperCalendar: env.VESPER_CALENDAR || profile.storageCalendar,

  tz: env.TIMEZONE || 'Asia/Seoul',

  // 연결해서 쓰는 AI: claude | chatgpt (앱 안의 이름과 '이어서 대화하기' 버튼 주소)
  assistant: (env.ASSISTANT || 'claude').toLowerCase() === 'chatgpt' ? 'chatgpt' : 'claude',
  // 앱에서 숨길 캘린더 이름 (쉼표 구분). 예: "생일,대한민국 공휴일"
  hiddenCalendars: (env.HIDDEN_CALENDARS || '').split(',').map((s) => s.trim()).filter(Boolean),
};

config.demo = !(config.icloudUser && config.icloudPassword);

// 세션 서명 키: 따로 없으면 비밀번호에서 파생
config.sessionSecret = env.SESSION_SECRET
  || crypto.createHash('sha256').update('cal-session:' + (config.appPassword || 'demo')).digest('hex');

if (config.demo && !config.appPassword) config.appPassword = 'demo';
if (config.demo && !config.mcpToken) config.mcpToken = 'demo';

config.assistantInfo = config.assistant === 'chatgpt'
  ? { name: 'ChatGPT', url: 'https://chatgpt.com/?q=' }
  : { name: 'Claude', url: 'https://claude.ai/new?q=' };
