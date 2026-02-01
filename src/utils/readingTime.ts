export function getReadingTime(text: string) {
  const WORDS_PER_MINUTE = 200;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}