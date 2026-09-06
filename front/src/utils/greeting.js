import { GREETINGS } from "../config/brand.js";

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
    const index = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(index) && index >= 0 && index < GREETINGS.length ? index : null;
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
  const index = Math.floor(Math.random() * GREETINGS.length);
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
export function formatGreeting(index, name) {
  const template = GREETINGS[index];
  if (!template) return "";
  if (!template.includes("{name}")) return template;
  if (!name) return template.replace(/[،,]?\s*\{name\}/, "").trim();
  return template.replace("{name}", name);
}
