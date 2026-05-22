---
title: "From Workflows to Agents: Building LLM Systems in Practice"
summary: "Ένα πρακτικό workshop στο TechSaloniki X για LLM συστήματα με workflows, agents, tools και evaluations."
date: 2026-05-01
featuredImage: "/projects/from-workflows-to-agents/featured.png"
tags:
  - workshop
  - agents
  - mlops
url_code: "/media/files/from_workflows_to_agents_workshop.zip"
url_slides: "/media/slides/from_workflows_to_agents_workshop.pptx"
url_pdf: ""
url_video: ""
weight: 0
---

**TechSaloniki X · Μάιος 2026 · Θεσσαλονίκη, Ελλάδα**

Αυτό το workshop εξερεύνησε πώς μπορούμε να χτίσουμε LLM συστήματα που πηγαίνουν πέρα από ένα απλό prompt.

Το παράδειγμα που χρησιμοποιήθηκε ήταν ένας μικρός support-ticket assistant. Ξεκινήσαμε με ένα απλό LLM call και σταδιακά προσθέσαμε τα κομμάτια που κάνουν αυτά τα συστήματα πιο χρήσιμα στην πράξη: structured outputs, tools, deterministic workflows, bounded agent loops και evaluation checks.

Το βασικό ερώτημα ήταν απλό:

Πρέπει αυτό να είναι ένα fixed workflow ή χρειάζεται πραγματικά έναν agent;

Ένα workflow είναι συνήθως η καλύτερη επιλογή όταν η διαδρομή είναι γνωστή. Δίνει έλεγχο στα βήματα, κάνει το debugging πιο εύκολο και κρατά το σύστημα πιο προβλέψιμο.

Ένας agent γίνεται χρήσιμος όταν το επόμενο βήμα εξαρτάται από όσα ανακαλύπτει το σύστημα κατά την εκτέλεση. Μπορεί να αποφασίσει ποιο tool θα καλέσει στη συνέχεια, αλλά αυτή η ευελιξία έχει tradeoffs: περισσότερη μεταβλητότητα, μεγαλύτερο κόστος, μεγαλύτερο latency και πιο δύσκολο evaluation.

Οπότε, ο στόχος δεν ήταν να παρουσιαστούν οι agents ως το φυσικό endpoint κάθε LLM εφαρμογής. Ήταν να δείξουμε πώς να σκεφτόμαστε αυτό το tradeoff και πώς να επιλέγουμε το ελάχιστο επίπεδο αυτονομίας που χρειάζεται για να λυθεί το πρόβλημα αξιόπιστα.

Το demo κάλυψε plain LLM calls, structured outputs, tool usage, deterministic workflows, bounded agent loops, golden dataset evaluation και optional LLM-as-a-Judge evaluation.

Το βασικό takeaway: το evaluation δεν είναι add-on. Είναι το κομμάτι που σου επιτρέπει να αλλάζεις το σύστημα με σιγουριά.
