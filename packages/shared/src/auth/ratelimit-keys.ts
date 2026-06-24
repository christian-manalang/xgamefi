export function rlKey(scope: string, identifier: string): string {
  return `rl:${scope}:${identifier}`;
}

export function loginFailKey(username: string): string {
  return `login:fail:${username.toLowerCase()}`;
}

export function backoffDelaySec(failureCount: number): number {
  if (failureCount <= 3) return 0;
  const delay = 2 ** (failureCount - 3); // 4→2, 5→4, 6→8...
  return Math.min(delay, 900);
}
