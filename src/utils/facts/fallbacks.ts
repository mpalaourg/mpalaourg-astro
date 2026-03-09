// Centralized fallback facts for the facts widget
export const fallbackGeneralFacts = [
  "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still edible.",
  "Octopuses have three hearts, nine brains, and blue blood.",
  "The shortest war in history was between Britain and Zanzibar on August 27, 1896. Zanzibar surrendered after 38 minutes.",
  "Bananas are berries, but strawberries aren't.",
  "A day on Venus is longer than a year on Venus.",
  "The Great Wall of China is not visible from space with the naked eye.",
  "Wombat poop is cube-shaped.",
  "The unicorn is the national animal of Scotland.",
  "A group of flamingos is called a 'flamboyance'.",
  "The average cloud weighs about 1.1 million pounds.",
];

export const fallbackOnThisDayFacts = [
  {
    fact: "On this day in 1969, the first test flight of the Concorde supersonic aircraft took place.",
    date: "02/03",
    source: "wikipedia.org",
    sourceUrl: "https://en.wikipedia.org/wiki/March_2",
  },
  {
    fact: "On this day in 1876, Alexander Graham Bell received a patent for the telephone.",
    date: "07/03",
    source: "wikipedia.org",
    sourceUrl: "https://en.wikipedia.org/wiki/March_7",
  },
  {
    fact: "On this day in 1989, the World Wide Web was invented by Tim Berners-Lee.",
    date: "12/03",
    source: "wikipedia.org",
    sourceUrl: "https://en.wikipedia.org/wiki/March_12",
  },
];

export const fallbackSportsQuestions = [
  {
    question: "Which country won the first FIFA World Cup in 1930?",
    answer: "Uruguay",
  },
  {
    question: "How many players are on a basketball team on the court?",
    answer: "5",
  },
  {
    question: "What is the maximum score in a single frame of bowling?",
    answer: "30",
  },
  {
    question: "In tennis, what is the term for a score of 40-40?",
    answer: "Deuce",
  },
  {
    question: "Which sport is known as 'the beautiful game'?",
    answer: "Football/Soccer",
  },
];

export function getRandomFallback(fallbacks: string[]): string {
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

export function getRandomFallbackObject<T>(fallbacks: T[]): T {
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}
