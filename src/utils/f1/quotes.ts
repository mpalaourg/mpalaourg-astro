// F1 Quotes Collection - Server-side only, not exposed to client
export interface F1Quote {
  quote: string;
  author: string;
  context?: string;
  year?: string;
  source?: string;
}

export const f1Quotes: F1Quote[] = [
  {
    quote: "Just leave me alone, I know what to do!",
    author: "Kimi Räikkönen",
    context: "To his race engineer during the 2012 Abu Dhabi Grand Prix",
    year: "2012",
    source: "https://www.formula1.com/en/latest/article/watch-just-leave-me-alone-the-ultimate-kimi-raikkonen-team-radio-collection.xWAYjOM6avYZuELwCOS4m"
  },
  {
    quote: "To whom it may concern: f*** you!",
    author: "Valtteri Bottas",
    context: "After winning the Australian Grand Prix and answering his critics",
    year: "2019",
    source: "https://www.formula1.com/en/latest/article/must-see-mercedes-hilarious-bottas-3-0-skit.1sB4N3qRX0oqeDkUTGOmgq"
  },
  {
    quote: "GP2 engine! GP2!",
    author: "Fernando Alonso",
    context: "Complaining about his Honda engine's lack of power at the 2015 Japanese Grand Prix",
    year: "2015"
  },
  {
    quote: "I'm not going to be a cucumber.",
    author: "Max Verstappen",
    context: "On not wanting to play a supporting role to his teammate",
    year: "2021"
  },
  {
    quote: "Lewis, it's James. Please hold position.",
    author: "James Vowles",
    context: "Mercedes strategist asking Hamilton to let Bottas through",
    year: "2021"
  },
  {
    quote: "Box, box, box!",
    author: "Various Race Engineers",
    context: "The most common instruction in F1 - telling drivers to pit"
  },
  {
    quote: "My tyres are gone!",
    author: "Every F1 Driver",
    context: "Universal complaint when drivers want their team to know they're struggling"
  },
  {
    quote: "We are checking.",
    author: "Ferrari Race Engineers",
    context: "Ferrari's typical response when a driver asks about strategy",
    year: "2010s-present"
  },
  {
    quote: "Smooth operator, smooth operations.",
    author: "Carlos Sainz",
    context: "His signature celebration after good results",
    year: "2021-present"
  },
  {
    quote: "It's lights out and away we go!",
    author: "David Croft",
    context: "Iconic commentary line at the start of every race"
  },
  {
    quote: "Absolute animal!",
    author: "Guenther Steiner",
    context: "His famous description of Kevin Magnussen after a great drive",
    year: "2019"
  },
  {
    quote: "Plan F, plan F!",
    author: "Mercedes Race Engineers",
    context: "Hamilton's race engineer giving him an alternative strategy",
    year: "Various"
  },
  {
    quote: "Get in there, Lewis!",
    author: "Peter Bonnington",
    context: "Hamilton's race engineer celebrating wins",
    year: "2013-present"
  },
  {
    quote: "Copy, understood.",
    author: "Lewis Hamilton",
    context: "His standard radio response to instructions"
  },
  {
    quote: "Is that Glock?",
    author: "Martin Brundle",
    context: "Spotting Timo Glock as Hamilton passed him for the title in Brazil",
    year: "2008",
    source: "https://www.formula1.com/en/latest/article/9-thrilling-title-deciding-finales-from-f1-history.57lx35G8vIsWRCOL5LV6cF"
  },
  {
    quote: "There is something loose between my legs.",
    author: "Felipe Massa",
    context: "Radio message about a problem with his car",
    year: "2010"
  },
  {
    quote: "I am stupid.",
    author: "Charles Leclerc",
    context: "After crashing in Azerbaijan Grand Prix qualifying",
    year: "2019",
    source: "https://www.formula1.com/en/latest/article/%27i-threw-all-the-potential-in-the-bin%27-leclerc-on-costly-qualifying-crash.4CGzc8n06C9QX25gvPybim"
  },
  {
    quote: "I don't check my mirrors.",
    author: "Nikita Mazepin",
    context: "When asked about his driving style",
    year: "2021"
  },
  {
    quote: "Multi-21, Seb. Multi-21.",
    author: "Mark Webber",
    context: "After Vettel disobeyed team orders to overtake him at Malaysia",
    year: "2013"
  },
  {
    quote: "Fernando is faster than you.",
    author: "Ferrari Race Engineer",
    context: "Famous team order to Massa to let Alonso pass",
    year: "2010"
  },
  {
    quote: "That's a big one!",
    author: "Romain Grosjean",
    context: "After his massive crash at Bahrain",
    year: "2020"
  },
  {
    quote: "I think Ericsson hit us.",
    author: "Haas race engineer",
    context: "After Grosjean crashed behind the Safety Car in Azerbaijan",
    year: "2018",
    source: "https://www.formula1.com/en/latest/article/f1s-wildest-azerbaijan-moments-from-10-years-of-racing-in-baku.4hKjzE3m20ov49AE4kSf0F"
  },
  {
    quote: "The engine feels good. Much slower than before.",
    author: "Sebastian Vettel",
    context: "Sarcastic comment about the Ferrari engine's performance",
    year: "2020"
  },
  {
    quote: "We must be very aggressive. Like a honey badger.",
    author: "Daniel Ricciardo",
    context: "His nickname 'The Honey Badger' came from this attitude",
    year: "2014"
  },
  {
    quote: "I was having a s***.",
    author: "Kimi Räikkönen",
    context: "When asked why he missed the pre-race presentation",
    year: "2006"
  },
  {
    quote: "Why did we stop?",
    author: "Kimi Räikkönen",
    context: "After retiring from a race and forgetting he had a problem",
    year: "2015"
  },
  {
    quote: "Bwoah.",
    author: "Kimi Räikkönen",
    context: "His signature sound when asked questions",
    year: "2012-2021"
  },
  {
    quote: "No Michael! No Michael, no! That was so not right!",
    author: "Toto Wolff",
    context: "To race director Michael Masi during the Abu Dhabi title decider",
    year: "2021",
    source: "https://www.formula1.com/en/latest/article/explained-understanding-one-of-themost-chaotic-controversial-title.4B98awxwP7JPgBWxIt5KnL"
  },
  {
    quote: "Checo is a legend.",
    author: "Max Verstappen",
    context: "After Perez helped him win the 2021 Abu Dhabi title",
    year: "2021"
  },
  {
    quote: "This guy is impossible to overtake.",
    author: "Lewis Hamilton",
    context: "About Fernando Alonso's defensive driving at Hungary",
    year: "2021"
  },
  {
    quote: "It was intentional.",
    author: "Max Verstappen",
    context: "After colliding with Hamilton at Silverstone",
    year: "2021"
  },
  {
    quote: "What a lap! Absolutely brilliant!",
    author: "David Croft",
    context: "His signature line for exceptional qualifying laps"
  },
  {
    quote: "Box for softs, box for softs!",
    author: "Christian Horner",
    context: "Last minute call to pit for fresh tires at Abu Dhabi 2021",
    year: "2021"
  },
  {
    quote: "Sorry guys, I f***ed up.",
    author: "Lando Norris",
    context: "After crashing at the end of the 2021 Russian GP",
    year: "2021"
  },
  {
    quote: "That was beautiful racing.",
    author: "Sebastian Vettel",
    context: "After a great battle with another driver"
  },
  {
    quote: "I need more power!",
    author: "Fernando Alonso",
    context: "Constant complaint during his McLaren-Honda years",
    year: "2015-2018"
  },
  {
    quote: "For sure.",
    author: "Every F1 Driver",
    context: "The most common phrase in F1 interviews"
  },
  {
    quote: "Plan B, plan B!",
    author: "Red Bull Race Engineers",
    context: "Switching to alternative strategies"
  },
  {
    quote: "DRS is a gift from the gods.",
    author: "Daniel Ricciardo",
    context: "On the importance of DRS for overtaking"
  },
  {
    quote: "These tires are done.",
    author: "Every F1 Driver",
    context: "When tires are past their best"
  },
  {
    quote: "That's a champions drive!",
    author: "Martin Brundle",
    context: "When a driver shows exceptional skill under pressure"
  },
  {
    quote: "Michael Schumacher is the greatest of all time.",
    author: "Sebastian Vettel",
    context: "Paying tribute to his idol",
    year: "2012"
  },
  {
    quote: "I'm just a normal guy who happens to drive fast.",
    author: "Kimi Räikkönen",
    context: "On his public persona vs private self"
  },
  {
    quote: "The car is undriveable.",
    author: "Lewis Hamilton",
    context: "When the Mercedes porpoising was at its worst",
    year: "2022"
  },
  {
    quote: "Push, push, push!",
    author: "Ferrari Race Engineers",
    context: "Constant encouragement to drivers"
  },
  {
    quote: "Stay out! Stay out!",
    author: "Mercedes Race Engineers",
    context: "Telling Hamilton to stay out in changing conditions",
    year: "2021"
  },
  {
    quote: "It's hammer time!",
    author: "Mercedes Race Engineers",
    context: "The call for Hamilton to push at maximum attack",
    year: "Various"
  },
  {
    quote: "Valtteri, it's James.",
    author: "James Vowles",
    context: "Mercedes' head of strategy making the tough calls",
    year: "2017-2021"
  },
  {
    quote: "Simply lovely!",
    author: "Max Verstappen",
    context: "His signature radio message after victories",
    year: "2017-present"
  },
  {
    quote: "Yeah, that's what happens when you don't leave space.",
    author: "Max Verstappen",
    context: "After a wheel-to-wheel battle on track",
    year: "2022"
  },
  {
    quote: "This is boring. I should have brought my pillow.",
    author: "Max Verstappen",
    context: "Complaining about the Monaco Grand Prix procession",
    year: "2024"
  },
  {
    quote: "Must be the water.",
    author: "Ferrari Race Engineer",
    context: "Deadpan reply after Leclerc said his seat was full of water",
    year: "2025"
  },
  {
    quote: "Stop inventing.",
    author: "Carlos Sainz",
    context: "Rejecting a team instruction at the British Grand Prix restart",
    year: "2022",
    source: "https://www.formula1.com/en/latest/article/we-stopped-inventing-jokes-perez-as-he-explains-2024-improvements-with-sainz.6FOFwkBCVK4RvgCaHlWjqF"
  },
  {
    quote: "Happy birthday to Will's mum!",
    author: "Lando Norris",
    context: "Singing to his race engineer's mother at Imola",
    year: "2022",
    source: "https://www.formula1.com/en/latest/article/sweary-outbursts-emotional-celebrations-and-cheeky-jokes-12-of-the-most.1dNv0yv1Dx6C1jX3gYPjCS"
  },
  {
    quote: "You will not have the drink.",
    author: "Ferrari race engineer",
    context: "Replying to Räikkönen's request at the Hungarian Grand Prix",
    year: "2018",
    source: "https://www.formula1.com/en/latest/article/sweary-outbursts-emotional-celebrations-and-cheeky-jokes-12-of-the-most.1dNv0yv1Dx6C1jX3gYPjCS"
  },
  {
    quote: "We did it, Will.",
    author: "Lando Norris",
    context: "To race engineer Will Joseph after his first Grand Prix win in Miami",
    year: "2024",
    source: "https://www.formula1.com/en/latest/article/leave-him-to-it-norris-race-engineer-reflects-on-an-emotional-victory-for.2Bd3Asyh5pccH1eMGsnzH6"
  },
  {
    quote: "George, you can win this!",
    author: "Toto Wolff",
    context: "Urging Russell on after the leaders collided in Austria",
    year: "2024",
    source: "https://www.formula1.com/en/latest/article/the-single-dumbest-thing-ive-done-wolff-reflects-on-embarrassing-radio.2M3VV4joVYFTBKEkwJDhxj"
  },
  {
    quote: "I love you guys.",
    author: "Lewis Hamilton",
    context: "At the end of his final race with Mercedes in Abu Dhabi",
    year: "2024",
    source: "https://www.formula1.com/en/latest/article/must-see-listen-in-to-hamiltons-emotional-radio-as-he-crosses-the-line-in.KoY6xK98TJqVbs4pNqZt1"
  },
  {
    quote: "Have a tea break while you're at it.",
    author: "Lewis Hamilton",
    context: "Waiting for Ferrari to decide on a team order in Miami",
    year: "2025",
    source: "https://www.formula1.com/en/latest/article/we-took-the-tough-decision-vasseur-defends-ferrari-team-orders-situation-in.4ejF8x5boJaBm4ixbzZ59S"
  }
];

export function getRandomQuote(excludedQuote?: string): F1Quote {
  const choices = excludedQuote ? f1Quotes.filter(({ quote }) => quote !== excludedQuote) : f1Quotes;
  const randomIndex = Math.floor(Math.random() * choices.length);
  return choices[randomIndex];
}

export function getAllQuotes(): F1Quote[] {
  return f1Quotes;
}
