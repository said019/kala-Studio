import { Star, Wrench, Leaf, Flame, Home, Sparkles } from "lucide-react";
import { EVENT_TYPES, EventType } from "./types";

const ICON_MAP = { star: Star, wrench: Wrench, leaf: Leaf, flame: Flame, home: Home, sparkles: Sparkles };

interface Props {
  type: EventType | string;
  size?: number;
  withBg?: boolean;
  className?: string;
}

export default function EventTypeIcon({ type, size = 16, withBg = false, className }: Props) {
  const info = EVENT_TYPES.find((t) => t.value === type);
  const color = info?.color ?? "#76214D";
  const iconName = info?.iconName ?? "sparkles";
  const Icon = ICON_MAP[iconName as keyof typeof ICON_MAP] ?? Sparkles;

  if (withBg) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-xl ${className ?? ""}`}
        style={{ background: `${color}18`, padding: size * 0.5 }}
      >
        <Icon size={size} style={{ color }} />
      </span>
    );
  }

  return <Icon size={size} style={{ color }} className={className} />;
}
