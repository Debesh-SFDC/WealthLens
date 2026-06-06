export default function AppLogoIcon({ size = 36, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="wl-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#6C63FF" />
        </linearGradient>
        <clipPath id="wl-clip">
          <circle cx="44" cy="44" r="22" />
        </clipPath>
      </defs>

      {/* Background */}
      <rect width="100" height="100" rx="20" fill="url(#wl-bg)" />

      {/* Rising trend line clipped to lens */}
      <g clipPath="url(#wl-clip)">
        <polyline
          points="24,56 34,47 44,51 54,40 65,32"
          fill="none"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Magnifying glass ring */}
      <circle cx="44" cy="44" r="22" fill="none" stroke="white" strokeWidth="5.5" />

      {/* Handle */}
      <line x1="60" y1="60" x2="73" y2="73" stroke="white" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  )
}
