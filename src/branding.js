import { ASSISTANTS } from '../public/assistant.js';
import { config } from './config.js';

export function branding(assistant = config.assistant) {
  const ai = ASSISTANTS[assistant] || ASSISTANTS[config.assistant];
  return { ...ai, icon: `/icons/${ai.id === 'chatgpt' ? 'chatgpt-' : ''}logo.svg` };
}

export function manifest(assistant) {
  const ai = branding(assistant);
  const prefix = ai.id === 'chatgpt' ? 'chatgpt-' : '';
  return {
    id: '/', name: 'Vesper', short_name: 'Vesper', lang: 'ko', start_url: '/', scope: '/',
    display: 'standalone', background_color: ai.id === 'chatgpt' ? '#F4F8F5' : '#FAF9F5',
    theme_color: ai.id === 'chatgpt' ? '#146B61' : '#D97757',
    icons: [192, 512].map(size => ({ src: `/icons/${prefix}icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' })),
  };
}
