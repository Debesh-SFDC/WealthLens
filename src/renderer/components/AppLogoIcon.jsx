export default function AppLogoIcon({ size = 36, className = '' }) {
  const id = `ll-${size}`
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
          <stop offset="0%"   stopColor="#8B5CF6"/>
          <stop offset="100%" stopColor="#6C63FF"/>
        </linearGradient>
      </defs>

      <rect width="100" height="100" rx="22" fill={`url(#${id}-bg)`}/>
      <path d="M32,22 H46 V64 H74 V78 H32 Z" fill="white"/>
    </svg>
  )
}
