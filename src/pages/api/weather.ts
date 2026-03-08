import type { APIRoute } from "astro";

// WeatherAPI.com - More accurate weather data
// Free tier: 1 million calls/month
// Get API key: https://www.weatherapi.com/signup.aspx
// Store WEATHER_API_KEY in environment variables

interface WeatherAPIResponse {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
    tz_id: string;
    localtime: string;
  };
  current: {
    temp_c: number;
    temp_f: number;
    condition: {
      text: string;
      icon: string;
      code: number;
    };
    wind_kph: number;
    wind_mph: number;
    wind_degree: number;
    wind_dir: string;
    pressure_mb: number;
    pressure_in: number;
    precip_mm: number;
    precip_in: number;
    humidity: number;
    cloud: number;
    feelslike_c: number;
    feelslike_f: number;
    vis_km: number;
    vis_miles: number;
    uv: number;
    gust_kph: number;
    gust_mph: number;
  };
  forecast: {
    forecastday: Array<{
      date: string;
      date_epoch: number;
      day: {
        maxtemp_c: number;
        maxtemp_f: number;
        mintemp_c: number;
        mintemp_f: number;
        avgtemp_c: number;
        avgtemp_f: number;
        maxwind_kph: number;
        maxwind_mph: number;
        totalprecip_mm: number;
        totalprecip_in: number;
        totalsnow_cm: number;
        avgvis_km: number;
        avgvis_miles: number;
        avghumidity: number;
        daily_will_it_rain: number;
        daily_chance_of_rain: number;
        daily_will_it_snow: number;
        daily_chance_of_snow: number;
        condition: {
          text: string;
          icon: string;
          code: number;
        };
        uv: number;
      };
      astro: {
        sunrise: string;
        sunset: string;
        moonrise: string;
        moonset: string;
        moon_phase: string;
        moon_illumination: number;
      };
      hour: Array<{
        time: string;
        temp_c: number;
        temp_f: number;
        condition: {
          text: string;
          icon: string;
          code: number;
        };
        wind_kph: number;
        wind_mph: number;
        wind_degree: number;
        wind_dir: string;
        pressure_mb: number;
        pressure_in: number;
        precip_mm: number;
        precip_in: number;
        humidity: number;
        cloud: number;
        feelslike_c: number;
        feelslike_f: number;
        windchill_c: number;
        windchill_f: number;
        heatindex_c: number;
        heatindex_f: number;
        dewpoint_c: number;
        dewpoint_f: number;
        will_it_rain: number;
        chance_of_rain: number;
        will_it_snow: number;
        chance_of_snow: number;
        vis_km: number;
        vis_miles: number;
        gust_kph: number;
        gust_mph: number;
        uv: number;
      }>;
    }>;
  };
}

interface WeatherData {
  location: string;
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    precipitation: number;
    weatherCode: number;
    condition: string;
    icon: string;
  };
  hourly: Array<{
    time: string;
    temp: number;
    weatherCode: number;
    icon: string;
  }>;
  daily: Array<{
    day: string;
    minTemp: number;
    maxTemp: number;
    weatherCode: number;
    icon: string;
  }>;
}

// Map WeatherAPI condition codes to our internal codes
// WeatherAPI uses different codes than Open-Meteo
function mapWeatherCode(code: number): number {
  // WeatherAPI condition codes: https://www.weatherapi.com/docs/weather_conditions.json
  // We'll keep them as-is and map to emojis in the frontend
  return code;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const lat = url.searchParams.get("lat") || "40.6401";
  const lon = url.searchParams.get("lon") || "22.9444";
  const lang = url.searchParams.get("lang") || "en";
  const city = url.searchParams.get("city") || "Thessaloniki";

  // Get API key from environment
  const runtime = locals.runtime as { env: { WEATHER_API_KEY?: string } };
  const apiKey = runtime.env.WEATHER_API_KEY;

  if (!apiKey) {
    // Fallback to Open-Meteo if no API key
    return fetchFromOpenMeteo(lat, lon, lang, city);
  }

  try {
    // Use lat/lon for more accurate location
    const query = `${lat},${lon}`;
    
    // WeatherAPI forecast endpoint (includes current + 3 days)
    const apiUrl = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${query}&days=8&aqi=no&alerts=no&lang=${lang === 'el' ? 'el' : 'en'}`;

    const res = await fetch(apiUrl);
    
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Invalid or expired API key, fallback to Open-Meteo
        return fetchFromOpenMeteo(lat, lon, lang, city);
      }
      throw new Error(`WeatherAPI error: ${res.status}`);
    }

    const data = await res.json() as WeatherAPIResponse;

    // Get current hour for hourly forecast
    const currentHour = new Date().getHours();
    
    // Format hourly data (next 16 hours, every 4 hours)
    const hourly: Array<{ time: string; temp: number; weatherCode: number; icon: string }> = [];
    const today = data.forecast.forecastday[0];
    const tomorrow = data.forecast.forecastday[1];
    
    // Get hours from today starting from current hour
    for (let i = currentHour; i < 24 && hourly.length < 4; i += 4) {
      const hour = today.hour[i];
      if (hour) {
        const date = new Date(hour.time);
        hourly.push({
          time: `${date.getHours().toString().padStart(2, '0')}:00`,
          temp: hour.temp_c,
          weatherCode: hour.condition.code,
          icon: hour.condition.icon,
        });
      }
    }
    
    // Fill remaining slots from tomorrow if needed
    if (hourly.length < 4 && tomorrow) {
      for (let i = 0; i < 24 && hourly.length < 4; i += 4) {
        const hour = tomorrow.hour[i];
        if (hour) {
          const date = new Date(hour.time);
          hourly.push({
            time: `${date.getHours().toString().padStart(2, '0')}:00`,
            temp: hour.temp_c,
            weatherCode: hour.condition.code,
            icon: hour.condition.icon,
          });
        }
      }
    }

    // Format daily data (next 7 days)
    const daily = data.forecast.forecastday.slice(1, 8).map((day) => {
      const date = new Date(day.date);
      return {
        day: date.toLocaleDateString(lang === "el" ? "el-GR" : "en-US", { weekday: "short" }),
        minTemp: day.day.mintemp_c,
        maxTemp: day.day.maxtemp_c,
        weatherCode: day.day.condition.code,
        icon: day.day.condition.icon,
      };
    });

    const weatherData: WeatherData = {
      location: data.location.name,
      current: {
        temp: data.current.temp_c,
        feelsLike: data.current.feelslike_c,
        humidity: data.current.humidity,
        windSpeed: data.current.wind_kph,
        precipitation: data.current.precip_mm,
        weatherCode: data.current.condition.code,
        condition: data.current.condition.text,
        icon: data.current.condition.icon,
      },
      hourly,
      daily,
    };

    return new Response(JSON.stringify(weatherData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600", // Cache for 10 minutes
      },
    });
  } catch (error) {
    console.error("WeatherAPI error:", error);
    // Fallback to Open-Meteo on any error
    return fetchFromOpenMeteo(lat, lon, lang, city);
  }
};

// Fallback to Open-Meteo if WeatherAPI fails
async function fetchFromOpenMeteo(lat: string, lon: string, lang: string, city: string): Promise<Response> {
  try {
    const apiUrl = new URL("https://api.open-meteo.com/v1/forecast");
    apiUrl.searchParams.set("latitude", lat);
    apiUrl.searchParams.set("longitude", lon);
    apiUrl.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation");
    apiUrl.searchParams.set("hourly", "temperature_2m,weather_code");
    apiUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    apiUrl.searchParams.set("timezone", "auto");
    apiUrl.searchParams.set("forecast_days", "8");

    const res = await fetch(apiUrl.toString());
    if (!res.ok) {
      throw new Error(`Open-Meteo API error: ${res.status}`);
    }

    interface OpenMeteoResponse {
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        precipitation: number;
        weather_code: number;
      };
      hourly: {
        time: string[];
        temperature_2m: number[];
        weather_code: number[];
      };
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        weather_code: number[];
      };
    }

    const data = await res.json() as OpenMeteoResponse;

    // Get current hour
    const now = new Date();
    const currentHour = now.getHours();
    
    // Find the index in the hourly array that matches current time
    const currentTimeIndex = data.hourly.time.findIndex((t: string) => {
      const timeDate = new Date(t);
      return timeDate.getHours() === currentHour && 
             timeDate.toDateString() === now.toDateString();
    });
    
    const startIndex = currentTimeIndex >= 0 ? currentTimeIndex : currentHour;
    
    // Format hourly data
    const hourly: Array<{ time: string; temp: number; weatherCode: number; icon: string }> = [];
    
    for (let i = 0; i < 4; i++) {
      const index = startIndex + (i * 4);
      if (index < data.hourly.time.length) {
        const timeStr = data.hourly.time[index];
        const date = new Date(timeStr);
        const hours = date.getHours().toString().padStart(2, '0');
        hourly.push({
          time: `${hours}:00`,
          temp: data.hourly.temperature_2m[index],
          weatherCode: data.hourly.weather_code[index],
          icon: "", // Open-Meteo doesn't provide icons
        });
      }
    }

    // Format daily data
    const daily = data.daily.time.slice(1, 8).map((time: string, i: number) => ({
      day: new Date(time).toLocaleDateString(lang === "el" ? "el-GR" : "en-US", { weekday: "short" }),
      minTemp: data.daily.temperature_2m_min[i + 1],
      maxTemp: data.daily.temperature_2m_max[i + 1],
      weatherCode: data.daily.weather_code[i + 1],
      icon: "", // Open-Meteo doesn't provide icons
    }));

    // Weather descriptions
    const weatherCodes: Record<number, string> = {
      0: lang === 'el' ? "Καθαρός ουρανός" : "Clear sky",
      1: lang === 'el' ? "Κυρίως καθαρός" : "Mainly clear",
      2: lang === 'el' ? "Μερικώς συννεφιασμένος" : "Partly cloudy",
      3: lang === 'el' ? "Συννεφιασμένος" : "Overcast",
      45: lang === 'el' ? "Ομιχλώδης" : "Foggy",
      48: lang === 'el' ? "Παγωμένη ομίχλη" : "Depositing rime fog",
      51: lang === 'el' ? "Ελαφριά ψιχάλα" : "Light drizzle",
      53: lang === 'el' ? "Ψιχάλα" : "Moderate drizzle",
      55: lang === 'el' ? "Πυκνή ψιχάλα" : "Dense drizzle",
      61: lang === 'el' ? "Ελαφρύς βροχή" : "Slight rain",
      63: lang === 'el' ? "Βροχή" : "Moderate rain",
      65: lang === 'el' ? "Έντονη βροχή" : "Heavy rain",
      71: lang === 'el' ? "Ελαφρύ χιόνι" : "Slight snow",
      73: lang === 'el' ? "Χιόνι" : "Moderate snow",
      75: lang === 'el' ? "Έντονο χιόνι" : "Heavy snow",
      77: lang === 'el' ? "Χιονόνερο" : "Snow grains",
      80: lang === 'el' ? "Ελαφριές μπόρες" : "Slight rain showers",
      81: lang === 'el' ? "Μπόρες" : "Moderate rain showers",
      82: lang === 'el' ? "Έντονες μπόρες" : "Violent rain showers",
      85: lang === 'el' ? "Ελαφριές χιονοπτώσεις" : "Slight snow showers",
      86: lang === 'el' ? "Έντονες χιονοπτώσεις" : "Heavy snow showers",
      95: lang === 'el' ? "Καταιγίδα" : "Thunderstorm",
      96: lang === 'el' ? "Καταιγίδα με χαλάζι" : "Thunderstorm with hail",
      99: lang === 'el' ? "Έντονη καταιγίδα" : "Heavy thunderstorm",
    };

    const weatherData: WeatherData = {
      location: city,
      current: {
        temp: data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        windSpeed: data.current.wind_speed_10m,
        precipitation: data.current.precipitation,
        weatherCode: data.current.weather_code,
        condition: weatherCodes[data.current.weather_code] || (lang === 'el' ? "Άγνωστο" : "Unknown"),
        icon: "",
      },
      hourly,
      daily,
    };

    return new Response(JSON.stringify(weatherData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600",
      },
    });
  } catch (error) {
    console.error("Open-Meteo fallback error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch weather data" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
