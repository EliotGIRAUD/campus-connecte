export function windowStartOf(at: Date, windowMs: number): Date {
  const time = at.getTime();
  if (!Number.isFinite(time) || windowMs <= 0) {
    return at;
  }
  return new Date(Math.floor(time / windowMs) * windowMs);
}
