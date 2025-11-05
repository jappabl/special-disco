/**
 * Puzzle generator for wake-up verification
 */

export type Puzzle = {
  question: string;
  answer: string; // Stored as string to handle various types
  type: "math" | "history" | "chemistry" | "coding" | "trivia";
};

/**
 * Generates a random puzzle
 */
export function generatePuzzle(): Puzzle {
  const types: Puzzle["type"][] = ["math", "history", "chemistry", "coding", "trivia"];
  const randomType = types[Math.floor(Math.random() * types.length)];

  switch (randomType) {
    case "math":
      return generateMathPuzzle();
    case "history":
      return generateHistoryPuzzle();
    case "chemistry":
      return generateChemistryPuzzle();
    case "coding":
      return generateCodingPuzzle();
    case "trivia":
      return generateTriviaPuzzle();
  }
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

function generateHistoryPuzzle(): Puzzle {
  const questions = [
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

  const selected = questions[Math.floor(Math.random() * questions.length)];
  return {
    question: selected.q,
    answer: selected.a,
    type: "history",
  };
}

function generateChemistryPuzzle(): Puzzle {
  const questions = [
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

  const selected = questions[Math.floor(Math.random() * questions.length)];
  return {
    question: selected.q,
    answer: selected.a,
    type: "chemistry",
  };
}

function generateCodingPuzzle(): Puzzle {
  const questions = [
    { q: "What does HTML stand for? (type: markup)", a: "markup" },
    { q: "What loop keyword continues to the next iteration in JS?", a: "continue" },
    { q: "What keyword declares a constant in JavaScript?", a: "const" },
    { q: "What does CSS stand for? (type: cascading)", a: "cascading" },
    { q: "What HTTP status code means 'Not Found'?", a: "404" },
    { q: "What HTTP status code means 'OK'?", a: "200" },
    { q: "What data structure uses LIFO (Last In First Out)?", a: "stack" },
    { q: "What data structure uses FIFO (First In First Out)?", a: "queue" },
    { q: "What is 2 to the power of 8?", a: "256" },
    { q: "How many bits in a byte?", a: "8" },
    { q: "What does SQL stand for? (type: structured)", a: "structured" },
    { q: "What is the result of true && false in JavaScript?", a: "false" },
    { q: "What keyword breaks out of a loop in most languages?", a: "break" },
    { q: "What is the index of the first element in an array?", a: "0" },
    { q: "What does API stand for? (type: application)", a: "application" },
    { q: "What does JSON stand for? (type: javascript)", a: "javascript" },
    { q: "What HTTP method is used to retrieve data?", a: "get" },
    { q: "What HTTP method is used to send data?", a: "post" },
    { q: "What HTTP method is used to update data?", a: "put" },
    { q: "What HTTP method is used to delete data?", a: "delete" },
    { q: "What HTTP status code means 'Unauthorized'?", a: "401" },
    { q: "What HTTP status code means 'Forbidden'?", a: "403" },
    { q: "What HTTP status code means 'Internal Server Error'?", a: "500" },
    { q: "What is the result of 10 % 3 in most languages?", a: "1" },
    { q: "What keyword is used to define a function in Python?", a: "def" },
    { q: "What symbol starts a comment in Python?", a: "#" },
    { q: "What symbol starts a single-line comment in JavaScript?", a: "//" },
    { q: "What does Git stand for? (type: git)", a: "git" },
    { q: "What command initializes a new Git repository?", a: "init" },
    { q: "What Git command shows the status of your repo?", a: "status" },
    { q: "What Git command stages changes?", a: "add" },
    { q: "What Git command saves your changes?", a: "commit" },
    { q: "What programming language runs in web browsers?", a: "javascript" },
    { q: "What is the most popular programming language in 2024?", a: "python" },
    { q: "What does OOP stand for? (type: object)", a: "object" },
    { q: "What is the opposite of synchronous?", a: "asynchronous" },
    { q: "What keyword is used for inheritance in many languages?", a: "extends" },
    { q: "What is null in JavaScript also known as?", a: "null" },
    { q: "What is the logical NOT operator in most languages?", a: "!" },
    { q: "What is the logical OR operator in JavaScript?", a: "||" },
    { q: "What is the logical AND operator in JavaScript?", a: "&&" },
    { q: "What does DOM stand for? (type: document)", a: "document" },
    { q: "What is 2^10 in computer science?", a: "1024" },
    { q: "How many bytes in a kilobyte?", a: "1024" },
    { q: "What is the extension for Python files?", a: ".py" },
    { q: "What is the extension for JavaScript files?", a: ".js" },
    { q: "What is the extension for TypeScript files?", a: ".ts" },
    { q: "What does CPU stand for? (type: central)", a: "central" },
    { q: "What does RAM stand for? (type: random)", a: "random" },
    { q: "What does URL stand for? (type: uniform)", a: "uniform" },
  ];

  const selected = questions[Math.floor(Math.random() * questions.length)];
  return {
    question: selected.q,
    answer: selected.a,
    type: "coding",
  };
}

function generateTriviaPuzzle(): Puzzle {
  const questions = [
    { q: "How many days in a leap year?", a: "366" },
    { q: "How many continents are there?", a: "7" },
    { q: "What planet is known as the Red Planet?", a: "mars" },
    { q: "How many hours in a day?", a: "24" },
    { q: "How many minutes in an hour?", a: "60" },
    { q: "How many legs does a spider have?", a: "8" },
    { q: "What is the capital of France?", a: "paris" },
    { q: "What is the capital of Japan?", a: "tokyo" },
    { q: "How many sides does a triangle have?", a: "3" },
    { q: "What is the largest ocean on Earth?", a: "pacific" },
    { q: "How many seconds in a minute?", a: "60" },
    { q: "How many days in a regular year?", a: "365" },
    { q: "How many months in a year?", a: "12" },
    { q: "How many weeks in a year?", a: "52" },
    { q: "How many states are in the USA?", a: "50" },
    { q: "What is the capital of Italy?", a: "rome" },
    { q: "What is the capital of Germany?", a: "berlin" },
    { q: "What is the capital of Spain?", a: "madrid" },
    { q: "What is the capital of England?", a: "london" },
    { q: "What is the capital of Canada?", a: "ottawa" },
    { q: "What is the capital of Australia?", a: "canberra" },
    { q: "What is the capital of Russia?", a: "moscow" },
    { q: "What is the capital of China?", a: "beijing" },
    { q: "What is the capital of Brazil?", a: "brasilia" },
    { q: "What is the capital of Egypt?", a: "cairo" },
    { q: "What planet is closest to the Sun?", a: "mercury" },
    { q: "What is the largest planet in our solar system?", a: "jupiter" },
    { q: "What planet has rings?", a: "saturn" },
    { q: "What is Earth's only natural satellite?", a: "moon" },
    { q: "How many planets are in our solar system?", a: "8" },
    { q: "What is the smallest planet in our solar system?", a: "mercury" },
    { q: "What is the hottest planet in our solar system?", a: "venus" },
    { q: "How many sides does a square have?", a: "4" },
    { q: "How many sides does a pentagon have?", a: "5" },
    { q: "How many sides does a hexagon have?", a: "6" },
    { q: "How many sides does an octagon have?", a: "8" },
    { q: "How many degrees in a circle?", a: "360" },
    { q: "How many degrees in a right angle?", a: "90" },
    { q: "What is the speed of light? (type: 299792458)", a: "299792458" },
    { q: "What is the boiling point of water in Celsius?", a: "100" },
    { q: "What is the freezing point of water in Celsius?", a: "0" },
    { q: "How many teeth does an adult human have?", a: "32" },
    { q: "How many bones are in the human body?", a: "206" },
    { q: "What is the largest mammal on Earth?", a: "blue whale" },
    { q: "What is the fastest land animal?", a: "cheetah" },
    { q: "What is the tallest mountain in the world?", a: "everest" },
    { q: "What is the longest river in the world?", a: "nile" },
    { q: "What is the largest country by area?", a: "russia" },
    { q: "What is the most populated country?", a: "china" },
    { q: "What language is most spoken worldwide?", a: "english" },
    { q: "How many colors in a rainbow?", a: "7" },
    { q: "What is the smallest unit of life?", a: "cell" },
    { q: "What do bees make?", a: "honey" },
    { q: "What is the opposite of hot?", a: "cold" },
    { q: "What is the opposite of up?", a: "down" },
    { q: "What is the opposite of left?", a: "right" },
    { q: "How many players on a basketball team?", a: "5" },
    { q: "How many players on a soccer team?", a: "11" },
    { q: "How many strings on a standard guitar?", a: "6" },
    { q: "How many keys on a standard piano?", a: "88" },
  ];

  const selected = questions[Math.floor(Math.random() * questions.length)];
  return {
    question: selected.q,
    answer: selected.a,
    type: "trivia",
  };
}
