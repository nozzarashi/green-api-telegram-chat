import type { SVGProps } from 'react';

const paths = {
  plus: 'M12 5v14M5 12h14',
  search: 'm21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  send: 'm22 2-7 20-4-9-9-4 20-7ZM22 2 11 13',
  back: 'm15 18-6-6 6-6',
  logout: 'M9 5H5v14h4M12 12h10m-4-4 4 4-4 4',
  close: 'm6 6 12 12M6 18 18 6',
  message:
    'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  check: 'm5 12 4 4L19 6',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff:
    'm3 3 18 18M10.5 5.1 12 5c7 0 10 7 10 7a17 17 0 0 1-3 4M6 6a18 18 0 0 0-4 6s3 7 10 7c1.5 0 3-.3 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
  help: 'M12 17h.01M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  warning: 'm12 3 10 18H2L12 3ZM12 9v4m0 4h.01',
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
