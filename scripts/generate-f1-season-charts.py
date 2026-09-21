#!/usr/bin/env python3
"""Generate the static SVG analysis charts used by the Formula season articles.

Data comes from the Jolpica F1 API, the maintained successor to Ergast. Run:

    python3 scripts/generate-f1-season-charts.py 2020 2021 2022 2023 2024 2025
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API = "https://api.jolpi.ca/ergast/f1"

TEAM_COLORS = {
    "red_bull": "#2456C7",
    "mclaren": "#F47600",
    "ferrari": "#E10600",
    "mercedes": "#00AFA0",
    "aston_martin": "#087A68",
    "alpine": "#E968A3",
    "haas": "#7C8792",
    "rb": "#5B75DB",
    "racing_bulls": "#5B75DB",
    "williams": "#1685D8",
    "sauber": "#2E9B59",
    "alfa": "#8E1F3D",
    "alphatauri": "#496B8A",
    "racing_point": "#D26AA5",
    "renault": "#E6C619",
}

TEAM_NAMES = {
    "red_bull": "Red Bull",
    "mclaren": "McLaren",
    "ferrari": "Ferrari",
    "mercedes": "Mercedes",
    "aston_martin": "Aston Martin",
    "alpine": "Alpine",
    "haas": "Haas",
    "rb": "Racing Bulls",
    "racing_bulls": "Racing Bulls",
    "williams": "Williams",
    "sauber": "Kick Sauber",
    "alfa": "Alfa Romeo",
    "alphatauri": "AlphaTauri",
    "racing_point": "Racing Point",
    "renault": "Renault",
}

RACE_LABELS = {
    "Bahrain Grand Prix": "Bahrain",
    "Saudi Arabian Grand Prix": "Saudi Arabia",
    "Australian Grand Prix": "Australia",
    "Japanese Grand Prix": "Japan",
    "Chinese Grand Prix": "China",
    "Miami Grand Prix": "Miami",
    "Emilia Romagna Grand Prix": "Imola",
    "Monaco Grand Prix": "Monaco",
    "Canadian Grand Prix": "Canada",
    "Spanish Grand Prix": "Spain",
    "Austrian Grand Prix": "Austria",
    "British Grand Prix": "Great Britain",
    "Belgian Grand Prix": "Belgium",
    "Hungarian Grand Prix": "Hungary",
    "Dutch Grand Prix": "Netherlands",
    "Italian Grand Prix": "Italy",
    "Azerbaijan Grand Prix": "Azerbaijan",
    "Singapore Grand Prix": "Singapore",
    "United States Grand Prix": "United States",
    "Mexico City Grand Prix": "Mexico",
    "São Paulo Grand Prix": "São Paulo",
    "Las Vegas Grand Prix": "Las Vegas",
    "Qatar Grand Prix": "Qatar",
    "Abu Dhabi Grand Prix": "Abu Dhabi",
}

TEAM_POINT_ADJUSTMENTS = {
    # Racing Point's 15-point deduction was applied after the fifth round.
    (2020, "racing_point", 5): -15,
}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def fetch_paginated(season: int, endpoint: str, list_key: str) -> list[dict]:
    """Fetch an endpoint and merge races that are split across API pages."""
    offset = 0
    merged: dict[int, dict] = {}
    while True:
        query = urllib.parse.urlencode({"limit": 100, "offset": offset})
        url = f"{API}/{season}/{endpoint}.json?{query}"
        request = urllib.request.Request(url, headers={"User-Agent": "mpalaourg.dev chart generator"})
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)["MRData"]
        for race in payload["RaceTable"]["Races"]:
            round_no = int(race["round"])
            if round_no not in merged:
                merged[round_no] = {**race, list_key: []}
            merged[round_no][list_key].extend(race.get(list_key, []))
        offset += int(payload["limit"])
        if offset >= int(payload["total"]):
            break
    return [merged[key] for key in sorted(merged)]


def driver_name(result: dict) -> str:
    driver = result["Driver"]
    return f'{driver["givenName"]} {driver["familyName"]}'


def family_name(name: str) -> str:
    return name.split()[-1]


def team_id(result: dict) -> str:
    return result["Constructor"]["constructorId"]


def team_color(team: str) -> str:
    return TEAM_COLORS.get(team, "#59636E")


def nice_max(value: float, ticks: int = 5) -> tuple[int, int]:
    if value <= 0:
        return 1, 1
    raw_step = value / ticks
    magnitude = 10 ** math.floor(math.log10(raw_step))
    normalized = raw_step / magnitude
    step = (1 if normalized <= 1 else 2 if normalized <= 2 else 5 if normalized <= 5 else 10) * magnitude
    maximum = int(math.ceil(value / step) * step)
    return maximum, int(step)


def svg_shell(width: int, height: int, title: str, subtitle: str, body: str) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
  <title id="title">{esc(title)}</title>
  <desc id="desc">{esc(subtitle)}</desc>
  <style>
    .display {{ font-family: "Avenir Next", Avenir, "Gill Sans", sans-serif; fill: #18212B; }}
    .label {{ font-family: "SFMono-Regular", Consolas, monospace; fill: #42505D; }}
    .muted {{ fill: #6E7A85; }}
  </style>
  <rect width="100%" height="100%" rx="24" fill="#F7F4EC"/>
  <path d="M 36 34 H {width - 34}" stroke="#D8D2C5" stroke-width="1"/>
  <path d="M 36 34 H 78" stroke="#4F7C76" stroke-width="4" stroke-linecap="round"/>
  <text x="42" y="75" class="display" font-size="34" font-weight="700">{esc(title)}</text>
  <text x="42" y="105" class="label muted" font-size="15" letter-spacing="1">{esc(subtitle.upper())}</text>
  {body}
</svg>
'''


def write_bar_chart(path: Path, title: str, subtitle: str, values: dict[str, int], colors: dict[str, str], unit: str) -> None:
    items = sorted(values.items(), key=lambda item: (-item[1], item[0]))
    width = 1200
    row_height = 42
    height = max(470, 165 + row_height * len(items))
    left, right, top, bottom = 220, 75, 145, 64
    plot_width = width - left - right
    plot_height = height - top - bottom
    maximum, step = nice_max(max(values.values()))
    parts: list[str] = []

    for tick in range(0, maximum + 1, step):
        x = left + plot_width * tick / maximum
        parts.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + plot_height}" stroke="#D8D2C5" stroke-width="1"/>')
        parts.append(f'<text x="{x:.1f}" y="{height - 28}" text-anchor="middle" class="label muted" font-size="14">{tick}</text>')

    for index, (label, value) in enumerate(items):
        y = top + index * row_height + 7
        bar_width = plot_width * value / maximum
        parts.append(f'<text x="{left - 18}" y="{y + 21}" text-anchor="end" class="display" font-size="18" font-weight="600">{esc(label)}</text>')
        parts.append(f'<rect x="{left}" y="{y}" width="{bar_width:.1f}" height="28" rx="4" fill="{colors[label]}"/>')
        parts.append(f'<text x="{left + bar_width + 12:.1f}" y="{y + 21}" class="label" font-size="17" font-weight="700">{value}</text>')

    parts.append(f'<text x="{left + plot_width / 2:.1f}" y="{height - 6}" text-anchor="middle" class="label muted" font-size="13">{esc(unit)}</text>')
    path.write_text(svg_shell(width, height, title, subtitle, "\n  ".join(parts)), encoding="utf-8")


def write_line_chart(
    path: Path,
    title: str,
    subtitle: str,
    race_names: list[str],
    series: dict[str, list[float]],
    colors: dict[str, str],
) -> None:
    width, height = 1480, 820
    left, right, top, bottom = 88, 260, 145, 155
    plot_width = width - left - right
    plot_height = height - top - bottom
    highest = max(max(points) for points in series.values())
    maximum, step = nice_max(highest, ticks=6)
    parts: list[str] = []

    for tick in range(0, maximum + 1, step):
        y = top + plot_height - plot_height * tick / maximum
        parts.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + plot_width}" y2="{y:.1f}" stroke="#D8D2C5" stroke-width="1"/>')
        parts.append(f'<text x="{left - 16}" y="{y + 5:.1f}" text-anchor="end" class="label muted" font-size="14">{tick}</text>')

    for index, race in enumerate(race_names):
        x = left + plot_width * index / (len(race_names) - 1)
        parts.append(f'<text x="{x:.1f}" y="{top + plot_height + 25}" transform="rotate(52 {x:.1f} {top + plot_height + 25})" class="label muted" font-size="12">{esc(race)}</text>')

    dash_patterns = ["", "10 6", "3 5", "14 5 3 5"]
    team_seen: Counter[str] = Counter()
    dash_by_label: dict[str, str] = {}
    for label, points in series.items():
        team = colors[label][1]
        color = colors[label][0]
        dash = dash_patterns[team_seen[team] % len(dash_patterns)]
        team_seen[team] += 1
        dash_by_label[label] = dash
        coords = []
        for index, value in enumerate(points):
            x = left + plot_width * index / (len(race_names) - 1)
            y = top + plot_height - plot_height * value / maximum
            coords.append(f"{x:.1f},{y:.1f}")
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        parts.append(f'<polyline points="{" ".join(coords)}" fill="none" stroke="{color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"{dash_attr}/>')

    legend_x = left + plot_width + 34
    for index, (label, _) in enumerate(series.items()):
        y = top + 16 + index * 38
        color, team = colors[label]
        dash = dash_by_label[label]
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        parts.append(f'<line x1="{legend_x}" y1="{y}" x2="{legend_x + 34}" y2="{y}" stroke="{color}" stroke-width="5" stroke-linecap="round"{dash_attr}/>')
        parts.append(f'<text x="{legend_x + 48}" y="{y + 6}" class="display" font-size="16" font-weight="600">{esc(label)}</text>')

    parts.append(f'<text x="26" y="{top + plot_height / 2:.1f}" transform="rotate(-90 26 {top + plot_height / 2:.1f})" text-anchor="middle" class="label muted" font-size="13">POINTS</text>')
    path.write_text(svg_shell(width, height, title, subtitle, "\n  ".join(parts)), encoding="utf-8")


def analyse(season: int) -> dict:
    races = fetch_paginated(season, "results", "Results")
    sprints = fetch_paginated(season, "sprint", "SprintResults")
    sprint_by_round = {int(race["round"]): race["SprintResults"] for race in sprints}

    podiums: Counter[str] = Counter()
    point_finishes: Counter[str] = Counter()
    fastest_laps: Counter[str] = Counter()
    dnfs: Counter[str] = Counter()
    sprint_points: Counter[str] = Counter()
    driver_team_counts: dict[str, Counter[str]] = defaultdict(Counter)
    driver_points_by_round: dict[str, Counter[int]] = defaultdict(Counter)
    team_points_by_round: dict[str, Counter[int]] = defaultdict(Counter)
    race_names: list[str] = []
    statuses: Counter[str] = Counter()

    for race in races:
        round_no = int(race["round"])
        race_names.append(RACE_LABELS.get(race["raceName"], race["raceName"].replace(" Grand Prix", "")))
        for result in race["Results"]:
            name = driver_name(result)
            constructor = team_id(result)
            position = int(result["position"])
            points = float(result["points"])
            status = result["status"]
            statuses[status] += 1
            driver_team_counts[name][constructor] += 1
            driver_points_by_round[name][round_no] += points
            team_points_by_round[constructor][round_no] += points
            if position <= 3:
                podiums[name] += 1
            if position <= 10:
                point_finishes[name] += 1
            if result.get("FastestLap", {}).get("rank") == "1":
                fastest_laps[name] += 1
            classified = status in {"Finished", "Lapped"} or re.fullmatch(r"\+\d+ Laps?", status)
            excluded = status in {"Disqualified", "Did not start", "Withdrawn"}
            if not classified and not excluded:
                dnfs[name] += 1

        for result in sprint_by_round.get(round_no, []):
            name = driver_name(result)
            constructor = team_id(result)
            points = float(result["points"])
            driver_team_counts[name][constructor] += 1
            driver_points_by_round[name][round_no] += points
            team_points_by_round[constructor][round_no] += points
            if points:
                sprint_points[name] += int(points)

    for (adjustment_season, constructor, round_no), points in TEAM_POINT_ADJUSTMENTS.items():
        if adjustment_season == season:
            team_points_by_round[constructor][round_no] += points

    rounds = list(range(1, len(races) + 1))
    driver_totals = {name: sum(points.values()) for name, points in driver_points_by_round.items()}
    team_totals = {team: sum(points.values()) for team, points in team_points_by_round.items()}
    driver_teams = {name: counts.most_common(1)[0][0] for name, counts in driver_team_counts.items()}

    def cumulative(points_by_round: Counter[int]) -> list[float]:
        total = 0.0
        values = []
        for round_no in rounds:
            total += points_by_round[round_no]
            values.append(total)
        return values

    top_drivers = sorted(driver_totals, key=lambda name: (-driver_totals[name], name))[:10]
    ordered_teams = sorted(team_totals, key=lambda team: (-team_totals[team], team))

    return {
        "race_names": race_names,
        "podiums": podiums,
        "point_finishes": point_finishes,
        "sprint_points": sprint_points,
        "fastest_laps": fastest_laps,
        "dnfs": dnfs,
        "driver_teams": driver_teams,
        "driver_totals": driver_totals,
        "team_totals": team_totals,
        "driver_progression": {name: cumulative(driver_points_by_round[name]) for name in top_drivers},
        "team_progression": {team: cumulative(team_points_by_round[team]) for team in ordered_teams},
        "statuses": statuses,
    }


def render_season(season: int) -> None:
    data = analyse(season)
    output = ROOT / "public" / "formula" / f"{season}-season"
    output.mkdir(parents=True, exist_ok=True)

    def driver_values(counter: Counter[str]) -> dict[str, int]:
        return {family_name(name): value for name, value in counter.items() if value}

    def driver_colors(counter: Counter[str]) -> dict[str, str]:
        return {family_name(name): team_color(data["driver_teams"][name]) for name in counter if counter[name]}

    write_bar_chart(output / "podium_finishes.svg", f"{season} podium finishers", "Grand Prix podiums by driver", driver_values(data["podiums"]), driver_colors(data["podiums"]), "PODIUM FINISHES")
    write_bar_chart(output / "point_finishes.svg", f"{season} points finishes", "Top-ten Grand Prix finishes by driver", driver_values(data["point_finishes"]), driver_colors(data["point_finishes"]), "TOP-TEN FINISHES")
    if data["sprint_points"]:
        write_bar_chart(output / "sprint_points.svg", f"{season} Sprint points", "Points earned across F1 Sprint sessions", driver_values(data["sprint_points"]), driver_colors(data["sprint_points"]), "SPRINT POINTS")
    write_bar_chart(output / "fastest_laps.svg", f"{season} fastest laps", "Fastest Grand Prix laps by driver", driver_values(data["fastest_laps"]), driver_colors(data["fastest_laps"]), "FASTEST LAPS")
    write_bar_chart(output / "dnfs.svg", f"{season} race retirements", "Grand Prix DNFs by driver; DNS and DSQ excluded", driver_values(data["dnfs"]), driver_colors(data["dnfs"]), "RACE RETIREMENTS")

    driver_series = {family_name(name): points for name, points in data["driver_progression"].items()}
    driver_line_colors = {family_name(name): (team_color(data["driver_teams"][name]), data["driver_teams"][name]) for name in data["driver_progression"]}
    write_line_chart(output / "points_progression_drivers.svg", f"{season} Drivers’ Championship", "Cumulative points after every round · final top ten", data["race_names"], driver_series, driver_line_colors)

    if season == 2021:
        head_to_head_names = [name for name in data["driver_progression"] if family_name(name) in {"Verstappen", "Hamilton"}]
        head_to_head_series = {family_name(name): data["driver_progression"][name] for name in head_to_head_names}
        head_to_head_colors = {
            family_name(name): (team_color(data["driver_teams"][name]), data["driver_teams"][name])
            for name in head_to_head_names
        }
        write_line_chart(
            output / "ver_ham_head2head.svg",
            "Verstappen vs Hamilton",
            "The 2021 title fight after every round",
            data["race_names"],
            head_to_head_series,
            head_to_head_colors,
        )

    def display_team(team: str) -> str:
        if team == "rb" and season >= 2025:
            return "Racing Bulls"
        return TEAM_NAMES.get(team, team)

    team_series = {display_team(team): points for team, points in data["team_progression"].items()}
    team_line_colors = {display_team(team): (team_color(team), team) for team in data["team_progression"]}
    write_line_chart(output / "points_progression_constructors.svg", f"{season} Constructors’ Championship", "Cumulative points after every round", data["race_names"], team_series, team_line_colors)

    print(f"\n{season}")
    for key in ["podiums", "point_finishes", "sprint_points", "fastest_laps", "dnfs"]:
        print(f"{key}: " + ", ".join(f"{family_name(name)} {value}" for name, value in data[key].most_common()))
    print("drivers: " + ", ".join(f"{family_name(name)} {points:g}" for name, points in sorted(data["driver_totals"].items(), key=lambda item: -item[1])))
    print("constructors: " + ", ".join(f"{display_team(team)} {points:g}" for team, points in sorted(data["team_totals"].items(), key=lambda item: -item[1])))
    print("statuses: " + ", ".join(f"{status} {count}" for status, count in data["statuses"].most_common()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("seasons", nargs="+", type=int)
    args = parser.parse_args()
    for season in args.seasons:
        render_season(season)


if __name__ == "__main__":
    main()
