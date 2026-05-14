export interface TimeOption {
  label: string;
  initial: number;
  increment: number;
}

export const TIME_OPTIONS: TimeOption[] = [
  { label: "5+0", initial: 300, increment: 0 },
  { label: "10+0", initial: 600, increment: 0 },
  { label: "10+5", initial: 600, increment: 5 },
  { label: "15+10", initial: 900, increment: 10 },
  { label: "90+30", initial: 5400, increment: 30 },
  { label: "Unlimited", initial: 0, increment: 0 },
];
export const BOARD_FRAME = 16;

