/** Small "i" with an explanation on hover. */
export function Info({ tip }: { tip: string }) {
  return (
    <span className="info" title={tip}>
      i
    </span>
  );
}
