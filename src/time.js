// A datetime-local value must be formatted in local time, without a UTC suffix.
export function callbackPreset(tomorrow = false, base = new Date()) {
  const value = new Date(base);
  if (tomorrow) {
    value.setDate(value.getDate() + 1);
    value.setHours(10, 0, 0, 0);
  } else {
    value.setTime(value.getTime() + 60 * 60 * 1000);
  }
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
