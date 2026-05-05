import { useRef, useEffect } from "react";
import { StockfishEngine } from "../chess";
import { BotPersonality } from "../data/botPersonalities";

export function useStockfishEngine(
  difficulty: number,
  selectedBot?: BotPersonality,
) {
  const engineRef = useRef<StockfishEngine | null>(null);

  // Initialize Stockfish engine
  useEffect(() => {
    engineRef.current = new StockfishEngine();
    return () => {
      engineRef.current?.quit();
    };
  }, []);

  // Configure engine based on bot personality or difficulty
  useEffect(() => {
    if (engineRef.current) {
      if (selectedBot) {
        // Use bot personality configuration
        engineRef.current.configureBotPersonality({
          skillLevel: selectedBot.skillLevel,
          playStyle: selectedBot.playStyle,
          depth: selectedBot.depth,
          thinkTimeMs: Math.max(
            250,
            Math.round(selectedBot.thinkTimeMs * 0.5),
          ),
          blunderChance: selectedBot.blunderChance,
          aggressiveness: selectedBot.aggressiveness,
        });
      } else {
        // Use simple difficulty slider (make level 1 very easy)
        // Level 1 = Skill 0, Level 10 = Skill 20
        const skillLevel = Math.max(0, (difficulty - 1) * 2.2);
        engineRef.current.setSkillLevel(Math.round(skillLevel));
      }
    }
  }, [difficulty, selectedBot]);

  return engineRef;
}
