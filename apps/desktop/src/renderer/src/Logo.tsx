/**
 * CodeAnvil wordmark glyph: the anvil + spark from the app icon, without the
 * rounded-square background, so it sits cleanly on the dark title bar. Colours
 * are fixed (steel anvil, amber spark) to match the icon regardless of theme.
 */
export function Logo({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="96 100 320 316"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g stroke="#f59e0b" strokeWidth="13" strokeLinecap="round" fill="none">
        <line x1="234" y1="158" x2="234" y2="116" />
        <line x1="188" y1="174" x2="166" y2="146" />
        <line x1="280" y1="174" x2="302" y2="146" />
      </g>
      <circle cx="234" cy="136" r="10" fill="#fbbf24" />
      <path
        fill="#e4e4e7"
        d="M 112 246 L 176 212 L 398 212 L 398 264 C 398 264 332 264 323 264 C 299 264 299 290 306 302 C 319 328 360 348 371 382 L 378 396 L 134 396 L 141 382 C 152 348 193 328 206 302 C 213 290 213 264 189 264 L 176 264 Z"
      />
    </svg>
  )
}
