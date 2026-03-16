/** Returns a cryptographically random integer in [min, max] inclusive. */
export function rollDice(min: number, max: number): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return min + (arr[0]! % (max - min + 1));
}

export function rollAction(): { value: number; descriptor: string } {
  const value = rollDice(1, 100);
  const descriptor =
    value <= 10 ? "catastrophic" :
    value <= 25 ? "poor" :
    value <= 50 ? "mediocre" :
    value <= 75 ? "decent" :
    value <= 90 ? "great" :
    "legendary";
  return { value, descriptor };
}

/** Fisher-Yates shuffle, returns up to n items from arr. */
export function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rollDice(0, i);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(0, Math.min(n, copy.length));
}
