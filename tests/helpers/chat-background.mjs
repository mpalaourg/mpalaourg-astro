// Entirely synthetic biography for tests. Never copy owner data into fixtures.
export const backgroundFacts=[
  {en:'He attended Example Primary School, Example Middle School and Example High School.',el:'Πήγε στο Δημοτικό, στο Γυμνάσιο και στο Λύκειο της Δοκιμαστικής Πόλης.'},
  {en:'He moved to Sample City in 2018.',el:'Μετακόμισε στη Δοκιμαστική Πόλη το 2018.'},
  {en:'His village is Example Village beside Example Mountain.',el:'Το χωριό του είναι το Δοκιμαστικό Χωριό δίπλα στο Δοκιμαστικό Βουνό.'},
  {en:'He supports Example FC and Example Racing.',el:'Υποστηρίζει τη Δοκιμαστική Ομάδα και τη Δοκιμαστική Αγωνιστική Ομάδα.'},
];
export const backgroundEnv={CHAT_OWNER_BACKGROUND_B64:Buffer.from(JSON.stringify(backgroundFacts),'utf8').toString('base64')};
