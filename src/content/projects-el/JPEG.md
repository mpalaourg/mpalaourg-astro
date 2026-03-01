---
title: "Συμπίεση JPEG"
summary: "Υλοποίηση προτύπου JPEG (ISO/IEC 109181:1994)."
date: 2020-02-01
featuredImage: "/mpalaourg-astro/projects/JPEG/featured.png"
tags:
  - image compression
  - multimedia
  - MATLAB
url_code: "https://github.com/mpalaourg/Multimedia"
url_pdf: "/mpalaourg-astro/el/media/files/jpeg.pdf"
url_slides: ""
url_video: ""
weight: 2
---

Υλοποίηση του βασικού encoder και decoder JPEG (με απώλεια πληροφορίας), που βασίζεται στον Διακριτό Μετασχηματισμό Συνημιτόνου (ΔΜΣ), σύμφωνα με το πρότυπο ISO-IEC-10918-1-1993. Τα κύρια βήματα είναι:

- **Προ-επεξεργασία**: Μετατροπή RGB ↔ YCbCr και υποδειγματοληψία (4:4:4, 4:2:2, 4:2:0)
- **Μετασχηματισμός**: Μπλοκ [8x8] ΔΜΣ για μετάβαση από χωρικό σε συχνοτικό πεδίο
- **Συμπίεση**: Κβαντισμός, κωδικοποίηση μήκους διαδρομής και Huffman

Για περισσότερες λεπτομέρειες δείτε το PDF.
