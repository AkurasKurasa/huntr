/** The Huntr caveman: dot head, arched legs, arched arm, spear. */
export default function Logo({ size = 30, color = 'currentColor', accent = '#FF7A59', className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <circle cx="8" cy="5" r="2.8" fill={accent} stroke="none" />
      <path d="M5 21v-5a4 4 0 0 1 8 0v5" />
      <path d="M9 12v-1a4 4 0 0 1 8 0" />
      <path d="M17 21V3" />
      <path d="M15.2 5.6 17 3l1.8 2.6" stroke={accent} />
    </svg>
  );
}
