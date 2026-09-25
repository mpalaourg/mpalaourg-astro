---
title: "Pi Messenger"
summary: "A distributed Raspberry Pi Zero messenger designed around periodic communication and low power use."
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

A distributed messenger for Raspberry Pi Zero devices communicating over Wi-Fi. Each device can generate messages and forward pending ones to other nodes.

The implementation combines:

- **Concurrent TCP threads:** Separate server, client, and message-creator threads.
- **Periodic delivery:** The client checks for peers and sends pending messages at one-minute intervals to reduce continuous activity.
- **Shared-state protection:** Mutexes guard data accessed by multiple threads.
- **Interrupt-driven creation:** Interrupts trigger the generation of new messages.

The server waits for incoming connections while the client periodically discovers active devices. The project explores the tradeoff between timely delivery and energy use.
