import {
  LucideIcon,
  Gamepad2,
  Bot,
  Users,
  Shuffle,
  Target,
} from "lucide-react";

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  accent: string;
  route: string;
  action: string;
}

export const iconMap: Record<string, LucideIcon> = {
  Gamepad2,
  Bot,
  Users,
  Shuffle,
  Target,
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "Play Online",
    title: "Play Online",
    description: "Play with other online players",
    icon: "Gamepad2",
    accent: "from-teal-500/80 to-emerald-500/80",
    route: "/play/quick",
    action: "",
  },
  {
    id: "play-bot",
    title: "Play with Bot",
    description: "Choose from themed bot personalities.",
    icon: "Bot",
    accent: "from-orange-500/80 to-red-500/80",
    route: "/play/bot",
    action: "",
  },
  {
    id: "play-friend",
    title: "Play a Friend",
    description: "Create a private game with a friend.",
    icon: "Users",
    accent: "from-sky-500/80 to-indigo-500/80",
    route: "/play/friend",
    action: "",
  },
  {
    id: "chess-variants",
    title: "Chess Variants",
    description: "Explore Chess960, King of the Hill, and more.",
    icon: "Shuffle",
    accent: "from-amber-500/90 to-orange-500/80",
    route: "/play/variants",
    action: "",
  },
  {
    id: "practice",
    title: "Practice",
    description: "practice.description",
    icon: "Target",
    accent: "from-purple-500/80 to-fuchsia-500/80",
    route: "/play/practice",
    action: "",
  },
];

export const BOARD_FRAME = 16;
