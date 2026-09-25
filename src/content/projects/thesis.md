---
title: "Mobile Battery Drain Prediction"
summary: "My thesis: an Android data collection app and machine learning pipeline for analyzing and predicting phone battery drain."
date: 2020-10-01
featuredImage: "/projects/thesis/featured.png"
tags:
  - battery
  - battery monitor
  - battery information
  - BatteryApp
  - smartphone usage
  - energy drain prediction
  - machine learning
  - xgboost
  - thesis
  - python
url_code: "https://github.com/mpalaourg/Thesis"
url_pdf: "/el/media/files/thesis.pdf"
url_slides: "/el/media/slides/thesis.pptx"
url_video: ""
weight: 1
---

For my thesis, I built [BatteryApp](https://play.google.com/store/apps/details?id=gr.auth.ee.issel.batteryapp), an Android app that records device usage and battery readings at regular intervals. I then used the collected data to study usage patterns and predict energy drain.

## Analysis pipeline

1. **Collect and prepare data:** BatteryApp records device and battery measurements for each sample.
2. **Group similar usage:** Hierarchical clustering identifies patterns without requiring a fixed number of groups in advance. The groups are then assessed for how much useful information they contain.
3. **Predict energy drain:** I trained separate models for the selected groups: linear regression, Ridge, Lasso, and eXtreme Gradient Boosting (XGBoost).

The diagram above shows the flow from data collection to clustering and prediction. The [thesis PDF](/el/media/files/thesis.pdf) contains the full methodology and results in Greek.

## What BatteryApp records

- **Battery:** Level, remaining capacity, temperature, voltage, technology, charging status, and health.
- **Device activity:** CPU use, available RAM, screen brightness, and whether the screen is on.
- **Connectivity:** Whether Wi-Fi, mobile data, Bluetooth, hotspot, and GPS are enabled. GPS location is not recorded.
- **Sample context:** Sampling time, sampling frequency, device model, and Android version.

Samples are associated with a unique user ID rather than a name. The [repository](https://github.com/mpalaourg/Thesis#raw-data-variables) documents the recorded variables in more detail.
