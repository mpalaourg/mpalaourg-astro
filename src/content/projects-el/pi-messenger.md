---
title: "Pi Messenger"
summary: "Επικοινωνία Raspberry Pi 0 μέσω Wi-Fi με ελάχιστη κατανάλωση ενέργειας."
date: 2019-06-01
featuredImage: "/projects/pi-messenger/featured.png"
tags:
  - Raspberry Pi 0
  - embedded systems
  - threading
  - networking
  - C
url_code: "https://github.com/mpalaourg/RTES_FinalTask"
url_pdf: ""
url_slides: ""
url_video: ""
weight: 6
---

Κατανεμημένο σύστημα μηνυμάτων όπου συσκευές Raspberry Pi 0 επικοινωνούν μέσω Wi-Fi. Κάθε συσκευή λειτουργεί ως κόμβος, δημιουργώντας και προωθώντας μηνύματα.

**Βασικά Χαρακτηριστικά:**

- **Πολυνηματική αρχιτεκτονική TCP**: Server, Client και Creator threads εκτελούνται παράλληλα
- **Εξοικονόμηση ενέργειας**: Client στέλνει μηνύματα κάθε 1 λεπτό
- **Συγχρονισμός**: Mutexes αποτρέπουν race conditions
- **Διαχείριση με διακοπές**: Δημιουργία νέων μηνυμάτων μέσω interrupts

Το σύστημα χρησιμοποιεί παθητικό Server που περιμένει συνδέσεις, και clients που ελέγχουν περιοδικά για ενεργές συσκευές.
