/* Inline stroke icons (24px grid). Decorative: aria-hidden. */
import type { ReactNode } from 'react';

function Svg({ children, sw = 2 }: { children: ReactNode; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  upload: () => (
    <Svg>
      <path d="M12 15V4M7 9l5-5 5 5M4 20h16" />
    </Svg>
  ),
  download: () => (
    <Svg>
      <path d="M12 4v11M7 10l5 5 5-5M4 20h16" />
    </Svg>
  ),
  sample: () => (
    <Svg>
      <path d="M14 3v5h5" />
      <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
      <path d="M9 13h6M9 17h4" />
    </Svg>
  ),
  sun: () => (
    <Svg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  ),
  moon: () => (
    <Svg>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </Svg>
  ),
  auto: () => (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
    </Svg>
  ),
  plus: () => (
    <Svg sw={2.4}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  minus: () => (
    <Svg sw={2.4}>
      <path d="M5 12h14" />
    </Svg>
  ),
  reset: () => (
    <Svg>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  ),
  left: () => (
    <Svg sw={2.4}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  ),
  right: () => (
    <Svg sw={2.4}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  ),
  x: () => (
    <Svg sw={2.4}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  search: () => (
    <Svg sw={2.2}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  critical: () => (
    <Svg sw={2.4}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v6M12 17h.01" />
    </Svg>
  ),
  warning: () => (
    <Svg sw={2.3}>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  good: () => (
    <Svg sw={2.6}>
      <path d="m5 12 4.5 4.5L19 7" />
    </Svg>
  ),
  info: () => (
    <Svg sw={2.3}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 11v6M12 7h.01" />
    </Svg>
  ),
  arrowIn: () => (
    <Svg>
      <path d="M17 7 7 17M7 9v8h8" />
    </Svg>
  ),
  arrowOut: () => (
    <Svg>
      <path d="M7 17 17 7M9 7h8v8" />
    </Svg>
  ),
  bank: () => (
    <Svg>
      <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
    </Svg>
  ),
  calendar: () => (
    <Svg>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </Svg>
  ),
  drag: () => (
    <Svg>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5v-2a1.5 1.5 0 0 1 3 0V12M14 10.5a1.5 1.5 0 0 1 3 0V12M17 11.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.5 15.5a1.5 1.5 0 0 1 2.6-1.6L8 15" />
    </Svg>
  ),
  cube: () => (
    <Svg>
      <path d="M12 2.5 3.5 7v10l8.5 4.5 8.5-4.5V7z" />
      <path d="m3.5 7 8.5 4.5L20.5 7M12 11.5v10" />
    </Svg>
  ),
  lock: () => (
    <Svg>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
};
