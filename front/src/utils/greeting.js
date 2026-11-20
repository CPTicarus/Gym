const STORAGE_KEY = "gym_greeting";

/**
 * Which line this session got. Persisted rather than re-rolled, because a
 * greeting that changed on every render — or every route change, or every
 * refresh — would read as noise rather than as something said to you once.
 * Stored alongside the tokens and cleared with them on logout.
 *
 * localStorage can throw (private browsing, blocked site data), so every
 * access is guarded; the fallback is simply a fresh pick each load.
 */
function readIndex() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const index = Number(stored);
    return stored !== null && Number.isSafeInteger(index) && index >= 0 ? index : null;
  } catch {
    return null;
  }
}

function writeIndex(index) {
  try {
    localStorage.setItem(STORAGE_KEY, String(index));
  } catch {
    /* nothing to do — the caller still gets a line for this page load */
  }
}

/** Draw a new line. Called on login, so each sign-in feels different. */
export function pickGreeting() {
  // Draw independently of config loading. The same draw also works after a list edit.
  const index = Math.floor(Math.random() * 0x80000000);
  writeIndex(index);
  return index;
}

/** Keep the stored line, or draw one if there isn't a usable one — the
 *  case where a session is restored from a token rather than a fresh login. */
export function ensureGreeting() {
  const index = readIndex();
  return index === null ? pickGreeting() : index;
}

export function clearGreeting() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored is the same outcome we wanted */
  }
}

/**
 * Fill the name into a line. Lines that don't mention {name} come back
 * unchanged; if there's no name to use, the placeholder and the comma
 * leading up to it are dropped rather than leaving a dangling "، ".
 */
export function formatGreeting(greetings, index, name) {
  if (!greetings.length) return "";
  const template = greetings[index % greetings.length];
  if (!template) return "";
  if (!template.includes("{name}")) return template;
  if (!name) return template.replace(/[،,]?\s*\{name\}/g, "").trim();
  return template.replaceAll("{name}", () => name);
}
