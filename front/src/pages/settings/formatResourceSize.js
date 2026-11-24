const UNITS = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت", "ترابایت", "پتابایت"];
const number = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 });

export function formatResourceSize(bytes) {
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${number.format(size)} ${UNITS[unit]}`;
}
