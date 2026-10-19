// iCloud 계정이 설정되지 않았을 때 쓰는 빈 메모리 저장소 (재시작하면 초기화)
const cals = [
  { url: 'demo://cal/personal/', name: 'Personal', color: '#D97757', order: 1 },
  { url: 'demo://cal/work/', name: 'Work', color: '#6A9BCC', order: 2 },
];
const objects = new Map(); // href → { cal, etag, data }
const newEtag = () => `"${Date.now()}-${Math.random()}"`;

export const demoStore = {
  async listCalendars() { return cals.map((c) => ({ ...c, readOnly: false })); },
  async queryObjects(calUrl) {
    return [...objects.entries()].filter(([, o]) => o.cal === calUrl).map(([href, o]) => ({ href, etag: o.etag, data: o.data }));
  },
  async getObject(href) {
    const o = objects.get(href);
    if (!o) throw Object.assign(new Error('Event not found'), { status: 404 });
    return { href, etag: o.etag, data: o.data };
  },
  async putObject(href, data, etag) {
    const o = objects.get(href);
    if (etag && o && o.etag !== etag) throw Object.assign(new Error('Changed elsewhere. Refresh and try again.'), { status: 409 });
    const cal = cals.find((c) => href.startsWith(c.url));
    objects.set(href, { cal: cal.url, etag: newEtag(), data });
  },
  async deleteObject(href) { objects.delete(href); },
  async createCalendar(name, color) {
    const url = `demo://cal/${Date.now()}/`;
    cals.push({ url, name, color, order: cals.length + 1 });
    return url;
  },
};
