import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ============================================================
// NEWS TOOLS
// ============================================================
// Uses Google News RSS feed — free, no API key needed.
// Fetches top headlines and parses the XML with simple regex.

export function newsTools() {
  return [
    tool(
      "get_news",
      "Get the latest news headlines. Can search by topic or get top headlines.",
      {
        topic: z
          .string()
          .optional()
          .describe(
            "Search topic (e.g. 'technology', 'sports', 'bitcoin'). Leave empty for top headlines."
          ),
      },
      async (args) => {
        try {
          const baseUrl = args.topic
            ? `https://news.google.com/rss/search?q=${encodeURIComponent(args.topic)}&hl=en`
            : "https://news.google.com/rss?hl=en";

          const res = await fetch(baseUrl);

          if (!res.ok) {
            throw new Error(`Google News returned ${res.status}`);
          }

          const xml = await res.text();

          // Parse RSS items with simple regex
          const items: Array<{ title: string; source: string; pubDate: string }> = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;

          while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
            const itemXml = match[1];
            const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
            const source = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "";
            const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";

            items.push({
              title: title.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
              source: source.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
              pubDate,
            });
          }

          if (items.length === 0) {
            return {
              content: [
                { type: "text" as const, text: "No news articles found." },
              ],
            };
          }

          return {
            content: [
              { type: "text" as const, text: JSON.stringify(items) },
            ],
          };
        } catch (err) {
          return {
            content: [
              { type: "text" as const, text: `Error fetching news: ${err}` },
            ],
            isError: true,
          };
        }
      }
    ),
  ];
}
