export type PuzzleType = "math" | "history" | "chemistry" | "coding" | "trivia";

export type Puzzle = {
  question: string;
  answer: string;
  type: PuzzleType;
};
