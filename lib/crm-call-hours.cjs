const timeZone = 'America/New_York';
const message = 'Outbound calls are allowed Monday–Friday 8 AM–8 PM and Saturday 8 AM–5 PM Eastern Time. Sunday calls are blocked.';
const clock = new Intl.DateTimeFormat('en-US', {
  timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function status(now = new Date()) {
  const parts = Object.fromEntries(clock.formatToParts(now).map(part => [part.type, part.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const closing = parts.weekday === 'Sat' ? 17 * 60 : 20 * 60;
  return { allowed: parts.weekday !== 'Sun' && minutes >= 8 * 60 && minutes < closing, timeZone, message };
}

module.exports = { status };
