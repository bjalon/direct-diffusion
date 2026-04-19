export const EVENT_ICON_MAX_BYTES = 160 * 1024;
export const EVENT_ICON_ACCEPT = 'image/png,image/jpeg,image/webp';

function toDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildSoapboxIcon() {
  return toDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="36" fill="#1b2434"/>
      <circle cx="48" cy="118" r="18" fill="#0a0f18"/>
      <circle cx="112" cy="118" r="18" fill="#0a0f18"/>
      <circle cx="48" cy="118" r="8" fill="#f6d365"/>
      <circle cx="112" cy="118" r="8" fill="#f6d365"/>
      <path d="M36 98h78l14-36H78L58 42 42 60h28" fill="none" stroke="#f6d365" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M85 47c7 0 12 5 12 12" fill="none" stroke="#f6d365" stroke-width="10" stroke-linecap="round"/>
    </svg>
  `);
}

function buildFootballIcon() {
  return toDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="36" fill="#14263a"/>
      <circle cx="80" cy="80" r="44" fill="#f5f8ff"/>
      <polygon points="80,58 92,67 88,82 72,82 68,67" fill="#14263a"/>
      <path d="M80 36v22M44 58l18 10M116 58l-18 10M56 114l16-14M104 114L88 100" fill="none" stroke="#14263a" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="80" cy="80" r="44" fill="none" stroke="#d0def2" stroke-width="4"/>
    </svg>
  `);
}

function buildHandballIcon() {
  return toDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="36" fill="#2c1e30"/>
      <circle cx="114" cy="48" r="18" fill="#ffb36b"/>
      <path d="M54 112c10-7 18-12 26-24 6-10 10-18 22-22" fill="none" stroke="#ffd9bf" stroke-width="12" stroke-linecap="round"/>
      <path d="M58 116c14 0 26-2 38-10 10-7 20-20 26-36" fill="none" stroke="#ffd9bf" stroke-width="12" stroke-linecap="round"/>
      <path d="M44 58l18 58h18l-10-36" fill="none" stroke="#ffd9bf" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);
}

export function eventDateToDate(value) {
  return value instanceof Date ? value : value?.toDate?.() ?? null;
}

export function eventDateToMs(value) {
  const date = eventDateToDate(value);
  return date ? date.getTime() : 0;
}

export function isEventPromoted(event, nowMs = Date.now()) {
  const startsAtMs = eventDateToMs(event?.promotionStartsAt);
  const endsAtMs = eventDateToMs(event?.promotionEndsAt);
  if (startsAtMs && startsAtMs > nowMs) return false;
  if (endsAtMs && nowMs > endsAtMs) return false;
  return event?.published !== false;
}

export function getEventLocationLabel(event) {
  const location = event?.location ?? {};
  return location.label || location.address || '';
}

export function getDefaultEventIconSrc(type) {
  if (type === 'soapbox') return buildSoapboxIcon();
  if (type === 'football') return buildFootballIcon();
  if (type === 'handball') return buildHandballIcon();

  return toDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <rect width="160" height="160" rx="36" fill="#1d2230"/>
      <circle cx="80" cy="80" r="32" fill="none" stroke="#c9d4ea" stroke-width="10"/>
      <path d="M80 40v18M80 102v18M40 80h18M102 80h18" stroke="#c9d4ea" stroke-width="10" stroke-linecap="round"/>
    </svg>
  `);
}

export function getEventIconSrc(event) {
  return event?.iconDataUrl || getDefaultEventIconSrc(event?.type);
}
