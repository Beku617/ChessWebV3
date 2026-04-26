export interface WatchLiveGame {
  id: string;
  white: string;
  whiteRating: number;
  whiteTitle?: string;
  black: string;
  blackRating: number;
  blackTitle?: string;
  viewers: string;
  time: string;
  type: string;
  category?: string;
  speed: string;
  gameUrl: string;
}
