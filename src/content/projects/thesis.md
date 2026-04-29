---
title: "Thesis"
summary: "Data Collection and Analysis of Energy Consumption of Mobile Phones using Machine Learning Techniques"
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

In a modern-day society, there is the consensus that smartphones have a dominant role in everyday life. By just pressing a button, someone can not only get up to speed with the current events on a global scale, but also get in touch with people all over the world and find various forms of entertainment. In particular, one of the features that makes smartphones so attractive is the portability they offer, since they utilize batteries. However, batteries have a certain amount of charges in their disposal, consequently the lifespan of a device is directly correlated to its utilization, as well as its charging strategy.

The current thesis focuses on the analysis of mobile phones' usage and the prediction of the battery's energy drain. To begin with, for data collection the application [BatteryApp](https://play.google.com/store/apps/details?id=gr.auth.ee.issel.batteryapp), which periodically keeps record of the device's usage and the battery information, was developed. The next step is the grouping of similar uses of devices through Hierarchical Clustering, which does not require an a priori selection for a specific cluster number and does not set limitations regarding the chosen distance function. After that, it was assessed based on its content in order to select the clusters with the higher information value. Lastly, the prediction of the energy drain was constructed by employing a simple linear model, two variants of linear regression, where the penalty concept is introduced (Ridge and Lasso Regression), and a non-linear model, which belongs to the Ensemble Learning category (eXtreme Gradient Boosted trees), with the parameters' learning procedure being applied to each selected cluster individually.

## **App Description**

As part of my Thesis, I have developed the Android application BatteryApp, which during its operation collects data from the mobile phone's usage and the battery status at regular intervals. The data collected is anonymous, as during the installation of the app you will be assigned a unique user ID. The information collected is:

- The unique ID that distinguishes you from other users
- The level, temperature, voltage, technology, status (charge/discharge), health (good/overheating) of the battery
- CPU usage
- If Wi-Fi, Cellular Data, Bluetooth, Hotspot, GPS [^1] of the mobile are activated
- The available RAM
- The screen brightness level
- If the phone is interactive (screen is turned on or off)
- Sampling frequency
- The model of the mobile and the android version
- The percentage remaining in the battery capacity
- The Timestamp of each sample

For a more detailed description, check [here](https://github.com/mpalaourg/Thesis#raw-data-variables).
[^1]: *Only if it is enabled, your location will NOT be logged*
