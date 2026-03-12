import GamePageConfig from "../models/GamePageConfig.js";

const defaultConfig = {
  key: "default",
  timeOptions: [
    { label: "3+0", initial: 180, increment: 0 },
    { label: "5+0", initial: 300, increment: 0 },
    { label: "5+3", initial: 300, increment: 3 },
    { label: "10+5", initial: 600, increment: 5 },
    { label: "∞", initial: 0, increment: 0 },
  ],
  quickActions: [
    {
      id: "quick-match",
      title: "Quick Match",
      description: "Start a game with your saved settings.",
      icon: "Gamepad2",
      accent: "from-teal-500/80 to-emerald-500/80",
      route: "",
      action: "startMatch",
      disabled: false,
    },
    {
      id: "play-bot",
      title: "Play with Bot",
      description: "Choose from themed bot personalities.",
      icon: "Bot",
      accent: "from-orange-500/80 to-red-500/80",
      route: "/play/bot",
      action: "",
      disabled: false,
    },
    {
      id: "play-both",
      title: "Play Both Sides",
      description: "Control both white and black pieces.",
      icon: "Swords",
      accent: "from-violet-500/80 to-purple-500/80",
      route: "/play/both",
      action: "",
      disabled: false,
    },
    {
      id: "play-friend",
      title: "Play a Friend",
      description: "Create a private table from Community.",
      icon: "Users",
      accent: "from-sky-500/80 to-indigo-500/80",
      route: "/community",
      action: "",
      disabled: false,
    },
    {
      id: "ChessVariations ",
      title: "ChessVariations",
      description: "Play 960, 4 player...",
      icon: "Brain",
      accent: "from-amber-500/90 to-orange-500/80",
      route: "/learn",
      action: "",
      disabled: false,
    },
    {
      id: "events-ladders",
      title: "Events & Ladders",
      description: "Check live arenas from your dashboard.",
      icon: "Trophy",
      accent: "from-purple-500/80 to-fuchsia-500/80",
      route: "/",
      action: "",
      disabled: false,
    },
  ],
};

export async function seedGamePageConfig() {
  const count = await GamePageConfig.countDocuments();
  if (count > 0) return;

  await GamePageConfig.create(defaultConfig);
  console.log("✅ Game page config seeded successfully");
}

export { defaultConfig };
