// API Response Types

export interface DriverStanding {
  position: string;
  points: string;
  wins: string;
  Driver: {
    permanentNumber: string;
    code: string;
    givenName: string;
    familyName: string;
  };
  Constructors: Array<{ constructorId: string; name: string }>;
}

export interface ConstructorStanding {
  position: string;
  points: string;
  wins: string;
  Constructor: { constructorId: string; name: string };
  drivers?: Array<{ name: string; points: string; pct: string }>;
}

// OpenF1 Types

export interface OpenF1SessionResult {
  position: number;
  driver_number: number;
  duration: number | number[] | null;
  gap_to_leader: number | number[] | null;
  number_of_laps: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  session_key: number;
  meeting_key: number;
}

export interface OpenF1Driver {
  driver_number: number;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  session_key: number;
}

export interface OpenF1Session {
  session_key: number;
  session_name: string;
  country_name: string;
  date_start: string;
  date_end: string;
}

// Normalised result row for UI
export interface OpenF1ResultRow {
  position: number;
  driverNumber: number;
  name: string;
  teamName: string;
  lapTime: string;
  gapToLeader: string;
  laps: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  // qualifying-only
  q1?: string;
  q2?: string;
  q3?: string;
}

// Race Data Types

export interface RaceSession {
  label: string;
  type: SessionType;
  date: Date;
}

export type SessionType = "fp1" | "fp2" | "fp3" | "sprint_qualifying" | "sprint" | "qualifying" | "race";

export interface Race {
  season: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    Location: {
      country: string;
      locality: string;
    };
  };
  date: string;
  time?: string;
  FirstPractice?: { date: string; time?: string };
  SecondPractice?: { date: string; time?: string };
  ThirdPractice?: { date: string; time?: string };
  Qualifying?: { date: string; time?: string };
  Sprint?: { date: string; time?: string };
  SprintQualifying?: { date: string; time?: string };
}

// UI Types

export interface Translations {
  nextRace: string;
  pastRace: string;
  upcoming: string;
  round: string;
  drivers: string;
  constructors: string;
  noRaceData: string;
  seasonNotStarted: string;
  driverStandingsEmpty: string;
  constructorStandingsEmpty: string;
  days: string;
  hrs: string;
  min: string;
  sec: string;
  prev: string;
  next: string;
  driver: string;
  constructor: string;
  number: string;
  points: string;
  wins: string;
  pts: string;
}
