import fs from "fs";
import path from "path";
import { Chess } from "chess.js";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RAW_DATA_PATH = path.join(__dirname, "PuzzleData.txt");
export const OUTPUT_DATA_PATH = path.join(__dirname, "puzzles.json");

const SECTION_HEADER_REGEX = /^(White|Black)\s+Mates?\s+in\s+(\d+)\.?$/i;
const FEN_REGEX =
  /^(?:[prnbqkPRNBQK1-8]+\/){7}[prnbqkPRNBQK1-8]+(?:\s+[wb](?:\s+\S+){0,5})?$/;
const RESULT_TOKEN_REGEX = /^(1-0|0-1|1\/2-1\/2|\*)$/;

function nextNonEmptyIndex(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index]) return index;
  }
  return -1;
}

function isSectionHeader(line) {
  return SECTION_HEADER_REGEX.test(line);
}

function parseSectionHeader(line) {
  const match = line.match(SECTION_HEADER_REGEX);
  if (!match) return null;

  return {
    preferredSide: match[1].toLowerCase() === "white" ? "w" : "b",
    mateIn: Number.parseInt(match[2], 10) || 2,
  };
}

function isFenLine(line) {
  return FEN_REGEX.test(line);
}

function isSolutionLine(line) {
  return /^1\.(?:\.\.)?\s*\S+/.test(line);
}

function normalizeFen(fen) {
  const parts = String(fen || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Missing FEN");
  }

  const board = parts[0];
  const sideToMove = parts[1] || "w";
  const castling = parts[2] || "-";
  const enPassant = parts[3] || "-";
  const halfmove = Number.parseInt(parts[4], 10);
  const fullmove = Number.parseInt(parts[5], 10);

  return [
    board,
    sideToMove,
    castling,
    enPassant,
    Number.isFinite(halfmove) && halfmove >= 0 ? String(halfmove) : "0",
    Number.isFinite(fullmove) && fullmove >= 1 ? String(fullmove) : "1",
  ].join(" ");
}

function parseSolutionLine(line) {
  return String(line || "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\d+\.(?:\.\.)?/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => token.replace(/[?!]+$/g, "").trim())
    .filter((token) => token && !RESULT_TOKEN_REGEX.test(token));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function estimateRating({ solution, isWhiteToMove, mateIn }) {
  const firstMove = solution[0] || "";
  const captureCount = solution.filter((move) => move.includes("x")).length;
  const promotionCount = solution.filter((move) => move.includes("=")).length;
  const checkingMoves = solution.filter((move) => /[+#]$/.test(move)).length;
  const underpromotionCount = solution.filter((move) => /=[NBR]/.test(move)).length;

  let rating = isWhiteToMove ? 1125 : 1200;
  rating += Math.max(0, mateIn - 1) * 75;
  rating += Math.min(captureCount * 40, 120);
  rating += promotionCount * 110;
  rating += underpromotionCount * 70;
  rating += Math.min(checkingMoves * 20, 60);

  if (/^[KQRBN]/.test(firstMove)) rating += 40;
  if (firstMove.includes("x")) rating += 25;
  if (/^O-O/.test(firstMove)) rating += 50;

  return clamp(Math.round(rating / 25) * 25, 1050, 1800);
}

function ratingToDifficulty(rating) {
  if (rating <= 1250) return "Easy";
  if (rating <= 1500) return "Medium";
  return "Hard";
}

function buildDescription(isWhiteToMove, mateIn) {
  return `${isWhiteToMove ? "White" : "Black"} to move and mate in ${mateIn}.`;
}

function validatePuzzle(puzzle) {
  const game = new Chess(puzzle.fen);

  for (const move of puzzle.solution) {
    const applied = game.move(move);
    if (!applied) {
      throw new Error(`Illegal solution move "${move}" for "${puzzle.title}"`);
    }
  }

  if (typeof game.in_checkmate === "function" && !game.in_checkmate()) {
    throw new Error(`Solution does not finish in checkmate for "${puzzle.title}"`);
  }
}

function createPuzzleRecord({ title, fen, solutionLine, section }) {
  const normalizedFen = normalizeFen(fen);
  const sideToMove = normalizedFen.split(/\s+/)[1];
  const isWhiteToMove = sideToMove === "w";
  const mateIn = section?.mateIn || 2;
  const solution = parseSolutionLine(solutionLine);
  const rating = estimateRating({ solution, isWhiteToMove, mateIn });

  const puzzle = {
    title,
    difficulty: ratingToDifficulty(rating),
    category: "mate",
    description: buildDescription(isWhiteToMove, mateIn),
    fen: normalizedFen,
    solution,
    rating,
    isWhiteToMove,
    mateIn,
  };

  if (section?.preferredSide && section.preferredSide !== sideToMove) {
    throw new Error(
      `Section side mismatch for "${title}": expected ${section.preferredSide}, got ${sideToMove}`,
    );
  }

  validatePuzzle(puzzle);
  return puzzle;
}

export function parsePuzzle3Text(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim());

  const puzzles = [];
  let currentSection = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    if (isSectionHeader(line)) {
      currentSection = parseSectionHeader(line);
      continue;
    }

    if (isFenLine(line) || isSolutionLine(line)) {
      continue;
    }

    const fenIndex = nextNonEmptyIndex(lines, index + 1);
    const solutionIndex =
      fenIndex >= 0 ? nextNonEmptyIndex(lines, fenIndex + 1) : -1;

    if (
      fenIndex < 0 ||
      solutionIndex < 0 ||
      !isFenLine(lines[fenIndex]) ||
      !isSolutionLine(lines[solutionIndex])
    ) {
      continue;
    }

    const puzzle = createPuzzleRecord({
      title: line,
      fen: lines[fenIndex],
      solutionLine: lines[solutionIndex],
      section: currentSection,
    });

    puzzles.push(puzzle);
    index = solutionIndex;
  }

  return puzzles;
}

export function buildPuzzle3Dataset() {
  const rawText = fs.readFileSync(RAW_DATA_PATH, "utf8");
  return parsePuzzle3Text(rawText);
}

export function writePuzzle3Dataset(outputPath = OUTPUT_DATA_PATH) {
  const puzzles = buildPuzzle3Dataset();
  fs.writeFileSync(outputPath, `${JSON.stringify(puzzles, null, 2)}\n`);
  return puzzles;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const puzzles = writePuzzle3Dataset();
  console.log(`Saved ${puzzles.length} puzzles to ${OUTPUT_DATA_PATH}`);
}
