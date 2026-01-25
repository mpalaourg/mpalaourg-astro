---
title: Lewis's record‑breaking year
summary: Challenging season, Covid‑19 limiting spectators, Hamilton's seventh
  title.
date: 2020-12-14
tags:
  - formula1
  - lewis-hamilton
external:
  code: https://github.com/mpalaourg/F1_DataAnalysis/blob/main/2020-Season/Season%20Analysis.ipynb
---

The 2020 Formula 1 season was significantly impacted by the global spread of the
Covid‑19 virus. The season, originally scheduled to begin in March, was postponed
for several months until July. The first eight rounds of the Championship were
held without spectators, and the remaining races were either run with limited
capacity or behind closed doors due to the second wave of the pandemic.

## Race Calendar

The season witnessed several significant developments. The **Australian Grand
Prix**, scheduled to be the season opener, was canceled just hours before the
first FP session. Other notable cancellations included the **Vietnam Grand Prix
at Hanoi Street Circuit** and the **Netherlands Grand Prix at Zandvoort**, which
was set to return after a hiatus of more than 30 years.

Initially, the calendar featured eight European tracks, but as time progressed,
more circuits were added. New venues such as **Mugello (Tuscany GP)** and
**Algarve (Portugal GP)** made their debut, while iconic circuits like
**Nürburgring**, **Imola**, and **Istanbul Park** returned.

An interesting aspect of the season was the hosting of multiple Grands Prix on
the same track. **Red Bull Ring**, **Silverstone**, and **Bahrain** each hosted
two races under different names.

Overall, the 2020 season comprised 17 Grands Prix.

<p class="text-center">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/calendar.png"
    alt="2020 race calendar"
    class="mx-auto"
  />
</p>

## Drivers and Constructors

The grid consisted of 10 teams and 23 drivers, including three reserve drivers.
Compared to 2019, several notable changes took place:

- **Esteban Ocon** replaced **Nico Hülkenberg** at Renault
- **Nicholas Latifi** replaced **Robert Kubica** at Williams
- **Toro Rosso** was rebranded as **AlphaTauri**
- **Mercedes AMG Petronas** adopted a black livery in 2020

Throughout the season, **Nico Hülkenberg** was called by **Racing Point** three
times as a replacement for drivers who contracted Covid‑19. Additionally,
**Jack Aitken** and **Pietro Fittipaldi** made their Formula 1 debuts.

<p class="text-center">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/drivers.png"
    alt="2020 drivers lineup"
    class="mx-auto"
  />
</p>

## 2020 Season Analysis

Among the 17 tracks, **Lewis Hamilton** stood out with the highest number of wins,
including an impressive five‑race winning streak from the **Eifel GP** to the
**Bahrain GP**. His teammate **Valtteri Bottas** crossed the finish line first
twice, contributing to **Mercedes AMG Petronas**’ total of 13 victories.

**Max Verstappen** secured two wins for **Red Bull Racing**, while **Pierre
Gasly** and **Sergio Pérez** claimed memorable victories at **Monza** and
**Sakhir**, respectively.

<p class="text-center">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/race_winners.png"
    alt="2020 race winners"
    class="mx-auto"
  />
</p>

Pole‑sitters successfully defended their positions in 10 races, with **Hamilton**
leading the way with eight successful defenses. In five races, the winner also
set the fastest lap, collecting the maximum available points.

One of the most dramatic moments of the season occurred at the **Bahrain GP**,
where [**Romain Grosjean’s horrific accident**](https://www.youtube.com/watch?v=7YMjw2sjXqU)
on lap 1 led to a red flag and halted the race for more than one hour.

## Points, Podiums and DNFs

A total of 13 drivers from seven teams achieved podium finishes. **Scuderia
Ferrari** endured a challenging season with only three podiums, while **Albon,
Norris, Gasly**, and **Ocon** celebrated their first Formula 1 podiums.

<p class="text-center">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/podium_finishes.png"
    alt="2020 podium finishes"
    class="mx-auto"
  />
</p>

Throughout the season, 20 drivers scored at least one points finish. **Hamilton**
recorded 16 point‑finishes in 17 races, missing only the **Sakhir GP**.

<p class="text-center">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/point_finishes.png"
    alt="2020 point finishes"
    class="mx-auto"
  />
</p>

A total of 57 DNFs were recorded. **Kevin Magnussen** led the count with seven
retirements, while **Verstappen** stood out by finishing on the podium in 11 of
the 12 races he completed.

<p class="text-center">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/dnfs.png"
    alt="2020 DNFs"
    class="mx-auto"
  />
</p>

## Final Standings

**Lewis Hamilton** secured his **seventh World Championship**, equalling
**Michael Schumacher’s** record. **Mercedes** dominated the Constructors’
Championship once again, finishing more than 200 points ahead of
**Red Bull Racing**.

<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/drivers_standings.png"
    alt="2020 driver standings"
    class="mx-auto"
  />
  <img
    src="https://raw.githubusercontent.com/mpalaourg/F1_DataAnalysis/main/2020-Season/imgs/constructor_standings.png"
    alt="2020 constructor standings"
    class="mx-auto"
  />
</div>

---

_Note: The data is compiled from the F1 Developer API (http://ergast.com/mrd/)._