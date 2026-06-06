export default function AppLogoIcon({ size = 36, className = '' }) {
  const id = `wl-${size}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#0D0B26"/>
          <stop offset="55%"  stopColor="#14113E"/>
          <stop offset="100%" stopColor="#1E1A6E"/>
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="18" y1="18" x2="78" y2="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#FFE082"/>
          <stop offset="50%"  stopColor="#F5A623"/>
          <stop offset="100%" stopColor="#C17D0A"/>
        </linearGradient>
        <linearGradient id={`${id}-chart`} x1="25" y1="58" x2="68" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#A78BFA"/>
          <stop offset="100%" stopColor="#FFFFFF"/>
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="42" cy="41" r="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#6C63FF" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#6C63FF" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={`${id}-lens`} cx="50%" cy="40%" r="55%">
          <stop offset="0%"   stopColor="#1C1745"/>
          <stop offset="100%" stopColor="#0E0C28"/>
        </radialGradient>
        <radialGradient id={`${id}-vig`} cx="50%" cy="50%" r="60%">
          <stop offset="0%"   stopColor="transparent"/>
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3"/>
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="42" cy="41" r="21.5"/>
        </clipPath>
      </defs>

      {/* Background */}
      <rect width="100" height="100" rx="22" fill={`url(#${id}-bg)`}/>
      <rect width="100" height="100" rx="22" fill={`url(#${id}-vig)`}/>

      {/* Glow */}
      <circle cx="42" cy="41" r="29" fill={`url(#${id}-glow)`}/>

      {/* Lens interior */}
      <circle cx="42" cy="41" r="21.5" fill={`url(#${id}-lens)`}/>

      {/* Chart */}
      <g clipPath={`url(#${id}-clip)`}>
        <polygon
          points="25,53 32,48 39,51 48,42 58,37 63,34 63,62 25,62"
          fill="rgba(108,99,255,0.18)"
        />
        <polyline
          points="25,53 32,48 39,51 48,42 58,37 63,34"
          fill="none"
          stroke={`url(#${id}-chart)`}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="48" r="1.6" fill="rgba(255,255,255,0.4)"/>
        <circle cx="48" cy="42" r="1.6" fill="rgba(255,255,255,0.4)"/>
        {/* Peak gold dot */}
        <circle cx="63" cy="34" r="3" fill="rgba(245,166,35,0.3)"/>
        <circle cx="63" cy="34" r="1.9" fill="#F5A623"/>
        <circle cx="63" cy="34" r="0.9" fill="#FFE082"/>
      </g>

      {/* Lens ring — gold */}
      <circle cx="42" cy="41" r="21.5" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="3.2"/>

      {/* Handle */}
      <line x1="58.5" y1="57.5" x2="73" y2="72"
        stroke={`url(#${id}-gold)`} strokeWidth="5.8" strokeLinecap="round"/>
      <line x1="59" y1="58" x2="72.5" y2="71.5"
        stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}
