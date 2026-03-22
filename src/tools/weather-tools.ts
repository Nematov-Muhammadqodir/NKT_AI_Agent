import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ============================================================
// WEATHER TOOLS
// ============================================================
// Uses wttr.in — a free weather API that needs no API key.
// Returns weather data in JSON format.

export function weatherTools() {
  return [
    tool(
      "get_weather",
      "Get current weather for a city. Returns temperature, humidity, wind, and conditions.",
      {
        city: z.string().describe("City name (e.g. 'London', 'New York', 'Tashkent')"),
      },
      async (args) => {
        try {
          const url = `https://wttr.in/${encodeURIComponent(args.city)}?format=j1`;
          const res = await fetch(url);

          if (!res.ok) {
            throw new Error(`wttr.in returned ${res.status}`);
          }

          const data = (await res.json()) as {
            current_condition: Array<{
              temp_C: string;
              temp_F: string;
              humidity: string;
              weatherDesc: Array<{ value: string }>;
              windspeedKmph: string;
              winddir16Point: string;
              FeelsLikeC: string;
            }>;
            nearest_area: Array<{
              areaName: Array<{ value: string }>;
              country: Array<{ value: string }>;
            }>;
          };

          const current = data.current_condition[0];
          const area = data.nearest_area[0];

          const weather = {
            location: `${area.areaName[0].value}, ${area.country[0].value}`,
            temperature: `${current.temp_C}°C (${current.temp_F}°F)`,
            feelsLike: `${current.FeelsLikeC}°C`,
            condition: current.weatherDesc[0].value,
            humidity: `${current.humidity}%`,
            wind: `${current.windspeedKmph} km/h ${current.winddir16Point}`,
          };

          return {
            content: [
              { type: "text" as const, text: JSON.stringify(weather) },
            ],
          };
        } catch (err) {
          return {
            content: [
              { type: "text" as const, text: `Error fetching weather: ${err}` },
            ],
            isError: true,
          };
        }
      }
    ),
  ];
}
