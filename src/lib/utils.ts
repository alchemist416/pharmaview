import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  try {
    let date: Date;
    // FDA uses YYYYMMDD format (e.g., "20240315")
    if (/^\d{8}$/.test(dateStr)) {
      const y = dateStr.slice(0, 4);
      const m = dateStr.slice(4, 6);
      const d = dateStr.slice(6, 8);
      date = new Date(`${y}-${m}-${d}`);
    } else {
      date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function getCountryColor(count: number): string {
  if (count > 200) return '#dc2626';
  if (count > 50) return '#7c3aed';
  if (count > 10) return '#1d4ed8';
  if (count >= 1) return '#1e3a5f';
  return '#0f1629';
}
