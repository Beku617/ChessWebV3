export interface TimeOption {
  label: string;
  initial: number;
  increment: number;
  category: string;
}

export interface DifficultyLevel {
  level: number;
  label: string;
  rating: string;
}

export const TIME_OPTIONS: TimeOption[] = [
  { label: "1+0", initial: 60, increment: 0, category: "Bullet" },
  { label: "2+1", initial: 120, increment: 1, category: "Bullet" },
  { label: "3+0", initial: 180, increment: 0, category: "Blitz" },
  { label: "3+2", initial: 180, increment: 2, category: "Blitz" },
  { label: "5+0", initial: 300, increment: 0, category: "Blitz" },
  { label: "5+3", initial: 300, increment: 3, category: "Blitz" },
  { label: "10+0", initial: 600, increment: 0, category: "Rapid" },
  { label: "10+5", initial: 600, increment: 5, category: "Rapid" },
  {
    label: "15+10",
    initial: 900,
    increment: 10,
    category: "Rapid",
  },
  {
    label: "30+0",
    initial: 1800,
    increment: 0,
    category: "Classical",
  },
];

export const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  { level: 1, label: "Beginner", rating: "~400" },
  { level: 3, label: "Easy", rating: "~800" },
  { level: 5, label: "Medium", rating: "~1200" },
  { level: 8, label: "Hard", rating: "~1600" },
  { level: 12, label: "Expert", rating: "~2000" },
  { level: 20, label: "Master", rating: "~2500" },
];

export const BOARD_FRAME = 16;
