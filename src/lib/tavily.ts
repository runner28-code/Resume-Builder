import { withRetry } from "@/lib/retry";

const TAVILY_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 15_000;

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

// Known engineering blog domains — used to bias Tavily toward high-quality technical content
const ENGINEERING_BLOGS: Record<string, string> = {
  google:      "blog.research.google",
  meta:        "engineering.fb.com",
  facebook:    "engineering.fb.com",
  netflix:     "netflixtechblog.com",
  uber:        "eng.uber.com",
  airbnb:      "medium.com/airbnb-engineering",
  linkedin:    "engineering.linkedin.com",
  stripe:      "stripe.com/blog/engineering",
  shopify:     "shopify.engineering",
  dropbox:     "dropbox.tech",
  lyft:        "eng.lyft.com",
  doordash:    "doordash.engineering",
  instacart:   "tech.instacart.com",
  slack:       "slack.engineering",
  twitter:     "blog.twitter.com",
  x:           "blog.twitter.com",
  figma:       "figma.com/blog/engineering",
  squarespace: "engineering.squarespace.com",
  etsy:        "codeascraft.com",
  yelp:        "engineeringblog.yelp.com",
  square:      "developer.squareup.com/blog",
  pinterest:   "medium.com/pinterest-engineering",
  databricks:  "databricks.com/blog/engineering",
  cloudflare:  "blog.cloudflare.com",
  github:      "github.blog/engineering",
  datadog:     "datadoghq.com/blog/engineering",
};

/** Returns the engineering blog domain for a company, or undefined if unknown. */
export function engineeringDomain(companyName: string): string | undefined {
  const key = companyName.toLowerCase().split(/[\s,.]/)[0];
  return ENGINEERING_BLOGS[key];
}

/** Deduplicates Tavily results by URL, preserving order (highest-score first). */
export function dedupeResults(results: TavilyResult[]): TavilyResult[] {
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
}

export async function tavilySearch(
  query: string,
  maxResults = 5,
  apiKey?: string | null,
  includeDomains?: string[]
): Promise<TavilyResult[]> {
  const key = apiKey || process.env.TAVILY_API_KEY!;

  try {
    return await withRetry(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const body: Record<string, unknown> = {
          query,
          search_depth: "basic",
          max_results: maxResults,
          include_answer: false,
        };
        if (includeDomains && includeDomains.length > 0) {
          body.include_domains = includeDomains;
        }

        const res = await fetch(TAVILY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Tavily ${res.status}: ${res.statusText}`);
        const data = (await res.json()) as { results: TavilyResult[] };
        return data.results ?? [];
      } finally {
        clearTimeout(timer);
      }
    });
  } catch (err) {
    console.error("[Tavily] request error after retries:", err);
    return [];
  }
}
