import type { SVGProps } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleHelp,
  Eye,
  EyeOff,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TriangleAlert,
  X,
  ExternalLink,
} from 'lucide-react';

const icons = {
  plus: Plus,
  search: Search,
  send: Send,
  back: ChevronLeft,
  logout: LogOut,
  close: X,
  message: MessageCircle,
  check: Check,
  eye: Eye,
  eyeOff: EyeOff,
  refresh: RefreshCw,
  help: CircleHelp,
  arrowRight: ArrowRight,
  warning: TriangleAlert,
  shield: ShieldCheck,
  external: ExternalLink,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  const Component = icons[name];
  return (
    <Component size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" {...props} />
  );
}
