/**
 * Puzzle generator for wake-up verification
 */

import type { Puzzle, PuzzleType } from "./types/puzzles";

export type { Puzzle } from "./types/puzzles";

const PUZZLE_TYPES: PuzzleType[] = ["math", "history", "chemistry", "coding", "trivia"];

type PuzzleFactory = () => Promise<Puzzle>;

const puzzleFactoryByType: Record<PuzzleType, PuzzleFactory> = {
  math: async () => generateMathPuzzle(),
  history: async () => (await import("./puzzleBanks/history")).generateHistoryPuzzle(),
  chemistry: async () => (await import("./puzzleBanks/chemistry")).generateChemistryPuzzle(),
  coding: async () => (await import("./puzzleBanks/coding")).generateCodingPuzzle(),
  trivia: async () => (await import("./puzzleBanks/trivia")).generateTriviaPuzzle(),
};

/**
 * Generates a random puzzle. Heavy question banks are lazy-loaded on demand
 * to reduce upfront bundle weight.
 */
export async function generatePuzzle(): Promise<Puzzle> {
  const randomType = PUZZLE_TYPES[Math.floor(Math.random() * PUZZLE_TYPES.length)];
  return puzzleFactoryByType[randomType]();
}

function generateMathPuzzle(): Puzzle {
  const operators = ["+", "-", "*"];
  const op = operators[Math.floor(Math.random() * operators.length)];

  let num1, num2, answer;

  if (op === "*") {
    num1 = Math.floor(Math.random() * 12) + 2;
    num2 = Math.floor(Math.random() * 12) + 2;
    answer = num1 * num2;
  } else if (op === "-") {
    num1 = Math.floor(Math.random() * 30) + 20;
    num2 = Math.floor(Math.random() * 15) + 1;
    answer = num1 - num2;
  } else {
    num1 = Math.floor(Math.random() * 50) + 1;
    num2 = Math.floor(Math.random() * 50) + 1;
    answer = num1 + num2;
  }

  return {
    question: `${num1} ${op} ${num2} = ?`,
    answer: answer.toString(),
    type: "math",
  };
}
