/** A simple helper for inserting one string into another */
export function stringSplice(
  target: string,
  index: number,
  deleteCount: number = 0,
  insertion: string = "",
): string {
  return target.slice(0, index) + insertion + target.slice(index + deleteCount);
}
