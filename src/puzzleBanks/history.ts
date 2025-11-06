import type { Puzzle } from "../types/puzzles";

const HISTORY_QUESTIONS: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What year did World War 2 end?", a: "1945" },
  { q: "What year did the USA declare independence?", a: "1776" },
  { q: "What year did World War 1 start?", a: "1914" },
  { q: "What year did the Berlin Wall fall?", a: "1989" },
  { q: "What year was the first iPhone released?", a: "2007" },
  { q: "What year did man first land on the moon?", a: "1969" },
  { q: "What year did the Titanic sink?", a: "1912" },
  { q: "What year did the Cold War end?", a: "1991" },
  { q: "What year was Google founded?", a: "1998" },
  { q: "What year was Facebook founded?", a: "2004" },
  { q: "What year did Christopher Columbus reach the Americas?", a: "1492" },
  { q: "What year did the Roman Empire fall?", a: "476" },
  { q: "What year did the French Revolution begin?", a: "1789" },
  { q: "What year was the Magna Carta signed?", a: "1215" },
  { q: "What year did the American Civil War start?", a: "1861" },
  { q: "What year did the Soviet Union collapse?", a: "1991" },
  { q: "What year was the Declaration of Independence signed?", a: "1776" },
  { q: "What year did Pearl Harbor happen?", a: "1941" },
  { q: "What year did the Renaissance begin? (type: 1300)", a: "1300" },
  { q: "What year did the Black Death peak in Europe?", a: "1348" },
  { q: "What century is the year 1850 in? (format: 19)", a: "19" },
  { q: "Who was the first President of the United States?", a: "washington" },
  { q: "Who wrote the Declaration of Independence?", a: "jefferson" },
  { q: "Who was the longest-reigning British monarch?", a: "elizabeth" },
  { q: "Who painted the Mona Lisa?", a: "da vinci" },
  { q: "Who invented the light bulb?", a: "edison" },
  { q: "Who was the first person in space?", a: "gagarin" },
  { q: "Who wrote Romeo and Juliet?", a: "shakespeare" },
  { q: "Who was the leader of Nazi Germany?", a: "hitler" },
  { q: "Who assassinated Abraham Lincoln?", a: "booth" },
  { q: "Who invented the telephone?", a: "bell" },
];

export function generateHistoryPuzzle(): Puzzle {
  const selected = HISTORY_QUESTIONS[Math.floor(Math.random() * HISTORY_QUESTIONS.length)];
  return {
    question: selected.q,
    answer: selected.a,
    type: "history",
  };
}
