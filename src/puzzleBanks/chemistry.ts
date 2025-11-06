import type { Puzzle } from "../types/puzzles";

const CHEMISTRY_QUESTIONS: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What is the chemical symbol for Gold?", a: "au" },
  { q: "What is the chemical symbol for Iron?", a: "fe" },
  { q: "What is the chemical symbol for Silver?", a: "ag" },
  { q: "What is the chemical symbol for Sodium?", a: "na" },
  { q: "What is the chemical symbol for Potassium?", a: "k" },
  { q: "What is the chemical symbol for Oxygen?", a: "o" },
  { q: "What is the chemical symbol for Hydrogen?", a: "h" },
  { q: "What is the chemical symbol for Carbon?", a: "c" },
  { q: "What is the chemical symbol for Helium?", a: "he" },
  { q: "What is H2O commonly known as?", a: "water" },
  { q: "What is the chemical symbol for Nitrogen?", a: "n" },
  { q: "What is the chemical symbol for Lead?", a: "pb" },
  { q: "What is the chemical symbol for Mercury?", a: "hg" },
  { q: "What is the chemical symbol for Copper?", a: "cu" },
  { q: "What is the chemical symbol for Zinc?", a: "zn" },
  { q: "What is the chemical symbol for Calcium?", a: "ca" },
  { q: "What is the chemical symbol for Chlorine?", a: "cl" },
  { q: "What is the chemical symbol for Fluorine?", a: "f" },
  { q: "What is the chemical symbol for Neon?", a: "ne" },
  { q: "What is the chemical symbol for Argon?", a: "ar" },
  { q: "What is the chemical symbol for Uranium?", a: "u" },
  { q: "What is the chemical symbol for Platinum?", a: "pt" },
  { q: "What is the chemical symbol for Tin?", a: "sn" },
  { q: "What is the chemical symbol for Tungsten?", a: "w" },
  { q: "What is NaCl commonly known as?", a: "salt" },
  { q: "What is CO2 commonly known as? (two words)", a: "carbon dioxide" },
  { q: "What is the atomic number of Hydrogen?", a: "1" },
  { q: "What is the atomic number of Carbon?", a: "6" },
  { q: "What is the atomic number of Oxygen?", a: "8" },
  { q: "What is the atomic number of Nitrogen?", a: "7" },
  { q: "How many electrons does a neutral Carbon atom have?", a: "6" },
  { q: "What is the pH of pure water?", a: "7" },
  { q: "What gas do plants produce during photosynthesis?", a: "oxygen" },
  { q: "What gas do humans breathe out?", a: "carbon dioxide" },
  { q: "What is the most abundant gas in Earth's atmosphere?", a: "nitrogen" },
];

export function generateChemistryPuzzle(): Puzzle {
  const selected = CHEMISTRY_QUESTIONS[Math.floor(Math.random() * CHEMISTRY_QUESTIONS.length)];
  return {
    question: selected.q,
    answer: selected.a,
    type: "chemistry",
  };
}
