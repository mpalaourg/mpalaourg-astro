// Shared UI/API copy keeps errors and saved failure messages in the active language.
const greek: Record<string, string> = {
  'Choose up to five pages or files from the source menu.': 'Επιλέξτε έως πέντε σελίδες ή αρχεία από το μενού πηγών.',
  'Response stopped.': 'Η απάντηση σταμάτησε.',
  'Message not found.': 'Το μήνυμα δεν βρέθηκε.',
  'Invalid message replacement.': 'Δεν ήταν δυνατή η αντικατάσταση του μηνύματος.',
  'Only the latest stopped or completed message can be edited.': 'Μπορείτε να επεξεργαστείτε μόνο το τελευταίο μήνυμα, αφού σταματήσει η απάντηση.',
  'The latest message changed. Reopen the conversation and try again.': 'Το τελευταίο μήνυμα άλλαξε. Ανοίξτε ξανά τη συνομιλία και δοκιμάστε ξανά.',
  'That source is no longer available. Please choose it again.': 'Αυτή η πηγή δεν είναι πια διαθέσιμη. Επιλέξτε την ξανά.',
  'Choose an available answer style.': 'Επιλέξτε ένα από τα διαθέσιμα ύφη απάντησης.',
  'Accept cookies to use the chat.': 'Για να χρησιμοποιήσετε τη συνομιλία, χρειάζεται να αποδεχτείτε τα cookies.',
  'The site guide is not configured yet.': 'Ο βοηθός δεν είναι ακόμη διαθέσιμος.',
  'Method not allowed.': 'Αυτό το αίτημα δεν υποστηρίζεται.',
  'Request origin rejected.': 'Το αίτημα δεν έγινε από αυτόν τον ιστότοπο.',
  'Cross-site request rejected.': 'Το αίτημα δεν έγινε από αυτόν τον ιστότοπο.',
  'Open the site guide before sending a request.': 'Ανοίξτε πρώτα τη συνομιλία και δοκιμάστε ξανά.',
  'Conversation not found.': 'Η συνομιλία δεν βρέθηκε.',
  'Send a JSON request of at most 4 KB.': 'Το αίτημα είναι πολύ μεγάλο ή δεν έχει τη σωστή μορφή.',
  'Invalid request.': 'Το αίτημα δεν είναι έγκυρο. Δοκιμάστε ξανά.',
  'Invalid conversation.': 'Η συνομιλία δεν βρέθηκε.',
  'The site guide is currently unavailable.': 'Ο βοηθός δεν είναι διαθέσιμος αυτή τη στιγμή.',
  'Conversation storage is full. Delete an old conversation and try again.': 'Δεν υπάρχει χώρος για νέα συνομιλία. Διαγράψτε μια παλιά και δοκιμάστε ξανά.',
  'Invalid archive state.': 'Δεν ήταν δυνατή η αλλαγή της αρχειοθέτησης. Δοκιμάστε ξανά.',
  'Use a title of 1–80 characters.': 'Ο τίτλος πρέπει να έχει από 1 έως 80 χαρακτήρες.',
  'Unknown action.': 'Αυτή η ενέργεια δεν υποστηρίζεται.',
  'Request ID already used.': 'Το αίτημα έχει ήδη σταλεί. Ανανεώστε τη συνομιλία.',
  'Please complete the bot check before asking.': 'Ολοκληρώστε πρώτα τον έλεγχο ασφαλείας.',
  'The bot check expired or failed. Please try again.': 'Ο έλεγχος ασφαλείας έληξε ή απέτυχε. Δοκιμάστε ξανά.',
  'The site guide is waiting for its content index.': 'Ο βοηθός δεν είναι ακόμη έτοιμος. Δοκιμάστε ξανά αργότερα.',
  'The site’s 200 daily questions have been used. Please return tomorrow.': 'Εξαντλήθηκε το ημερήσιο όριο των 200 ερωτήσεων για τον ιστότοπο. Δοκιμάστε ξανά μετά τις 00:00 UTC.',
  'You’ve used your 10 daily questions. Please return tomorrow.': 'Φτάσατε τις 10 ερωτήσεις για σήμερα. Μπορείτε να ρωτήσετε ξανά μετά τα μεσάνυχτα.',
  'Please wait a minute before asking another question.': 'Περιμένετε ένα λεπτό πριν στείλετε άλλη ερώτηση.',
  'Start a new conversation to continue. Each chat allows four questions.': 'Ξεκινήστε μια νέα συνομιλία για να συνεχίσετε. Κάθε συνομιλία χωράει έως τέσσερις ερωτήσεις.',
  'A question is already being processed. Refresh the conversation shortly.': 'Ο βοηθός απαντά ήδη σε μια ερώτηση. Περιμένετε λίγο και ανανεώστε τη συνομιλία.',
  'The guide could not answer this time. Please try again later.': 'Δεν ήταν δυνατή η απάντηση. Δοκιμάστε ξανά σε λίγο.',
  'The request was interrupted. Please ask again.': 'Η σύνδεση διακόπηκε πριν ολοκληρωθεί η απάντηση. Στείλτε ξανά την ερώτησή σας.',
  'The site guide is temporarily unavailable.': 'Ο βοηθός δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά αργότερα.',
};
export function chatText(text: string, lang: 'en' | 'el') {
  // Simplify previously saved failures without rewriting conversation history.
  if (text === 'The guide could not answer this time. This attempt counts toward today’s limit. Please try again later.') text = 'The guide could not answer this time. Please try again later.';
  if (lang === 'en') return text;
  if (greek[text]) return greek[text];
  const questionLimit = text.match(/^Ask a question of 1–(\d+) characters\.$/);
  return questionLimit ? `Η ερώτησή σας πρέπει να έχει από 1 έως ${questionLimit[1]} χαρακτήρες.` : text;
}
