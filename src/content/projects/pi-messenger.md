---
title: "Pi Messenger"
summary: "Raspberry Pi 0 communication over Wi-Fi with minimal energy consumption."
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

A distributed messaging system where Raspberry Pi 0 devices communicate over Wi-Fi. Each device acts as a node, generating and forwarding messages to ensure information reaches all devices.

**Key Features:**

- **Multi-threaded TCP architecture**: Server, Client, and Creator threads running simultaneously
- **Energy-efficient**: Client sends messages at 1-minute intervals to conserve power
- **Synchronization**: Mutexes prevent race conditions when accessing shared resources
- **Event-driven messaging**: Interrupts trigger new message creation at random intervals

The system uses passive-mode server threads waiting for connections, and clients that periodically check for active devices and deliver pending messages.
