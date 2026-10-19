// Trusted application composition. Never populated by browser input.
let selected = {
  id: 'office', storageCalendar: 'Vesper Office', actions: true,
  areas: [
    { name: '업무', color: '#6A9BCC', subs: ['회의', '문서', '보고', '프로젝트'] },
    { name: '개인', color: '#D97790', subs: [] },
    { name: '집', color: '#7CA25A', subs: [] },
  ],
  topicArea: '업무', topicTag: '프로젝트',
};
let locked = false;
export function configureProfile(profile) {
  if (locked) throw new Error('Configure the application before importing the calendar engine.');
  if (!profile?.id || !Array.isArray(profile.areas)) throw new Error('Invalid application profile');
  selected = { ...selected, ...profile };
}
export function applicationProfile() { locked = true; return selected; }
