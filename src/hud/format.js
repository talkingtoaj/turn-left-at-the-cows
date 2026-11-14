// Small pure helpers for turning raw state numbers into dash text.
import { odometerHundredths } from '../units.js';

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// Wrap any angle into 0..359.
export function normHeading(deg) {
  return ((Math.round(deg) % 360) + 360) % 360;
}

// "NE 47°"
export function headingText(deg) {
  const h = normHeading(deg);
  return `${POINTS[Math.round(h / 45) % 8]} ${h}°`;
}

// Game clock minutes to "HH:MM" (wraps past midnight).
export function clockText(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// Real elapsed ms to "mm:ss" (minutes can grow past 59).
export function timerText(ms) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// Metres to an odometer digit string like "0012.34" (miles, 2 decimals).
export function odoDigits(metres) {
  const mi = Math.min(odometerHundredths(metres) / 100, 9999.99);
  return mi.toFixed(2).padStart(7, '0');
}

function pad(n) {
  return String(n).padStart(2, '0');
}
