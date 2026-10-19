// Vercel 서버리스 함수 진입점 — /api/* 와 /mcp/* 요청이 모두 여기로 옵니다 (vercel.json 참고)
import handler from '../src/handler.js';

export const config = { maxDuration: 30 };
export default handler;
