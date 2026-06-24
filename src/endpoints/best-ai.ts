import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { type AppEnv } from "../types";

export class BestAI extends OpenAPIRoute {
	schema = {
		tags: ["AI"],
		summary: "Find the best AI platform for a given prompt using Tavily search",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							prompt: z.string().min(5),
						}),
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Returns the recommended AI platform",
				content: {
					"application/json": {
						schema: z.object({
							platform: z.string(),
							reasoning: z.string().optional(),
						}),
					},
				},
			},
			"500": { description: "Server error" },
		},
	};

	async handle(c: Context<AppEnv>) {
		const groqKey = c.env.GROQ_API_KEY;
		const tavilyKey = c.env.TAVILY_API_KEY;

		if (!groqKey || !tavilyKey) {
			return c.json({ error: "Server misconfigured (missing keys)" }, 500);
		}

		const { prompt } = await c.req.json<{ prompt: string }>();

		try {
			// 1. Search Tavily for the best AI tools for this prompt's use case
			const tavilyResponse = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					api_key: tavilyKey,
					query: `Best AI tool or platform right now for: ${prompt}`,
					search_depth: "basic",
					include_answer: true,
					max_results: 3,
				}),
			});

			if (!tavilyResponse.ok) {
				console.error("Tavily error:", await tavilyResponse.text());
				// Fallback to basic Groq if Tavily fails
				return this.fallbackGroq(prompt, groqKey, c);
			}

			const tavilyData = (await tavilyResponse.json()) as any;
			const searchContext = tavilyData.answer || tavilyData.results?.map((r: any) => r.content).join("\n") || "";

			// 2. Use Groq to analyze the search results and pick ONE best tool
			const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${groqKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "llama-3.3-70b-versatile",
					messages: [
						{
							role: "system",
							content: "You are an expert at recommending the absolute best AI platform (e.g. ChatGPT, Claude, Midjourney, Excel AI, GitHub Copilot) for a specific prompt. Based on the web search context provided, return exactly ONE platform name. No extra text, no markdown. Just the tool name."
						},
						{
							role: "user",
							content: `Task/Prompt: ${prompt}\n\nSearch Context:\n${searchContext}`
						}
					],
					temperature: 0.1,
				}),
			});

			if (!aiResponse.ok) {
				return this.fallbackGroq(prompt, groqKey, c);
			}

			const data = (await aiResponse.json()) as any;
			let bestPlatform = data.choices?.[0]?.message?.content?.trim() || "ChatGPT";
			
			// Clean up quotes if any
			bestPlatform = bestPlatform.replace(/["']/g, '');

			return c.json({
				platform: bestPlatform,
			});
		} catch (error) {
			console.error("Best AI ERROR:", (error as Error).message);
			return c.json({ platform: "ChatGPT" });
		}
	}

	async fallbackGroq(prompt: string, groqKey: string, c: Context<AppEnv>) {
		try {
			const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${groqKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "llama-3.3-70b-versatile",
					messages: [
						{
							role: "system",
							content: "Based on this prompt, return the single best AI tool to use. Return ONLY the tool name, nothing else."
						},
						{
							role: "user",
							content: prompt
						}
					],
					temperature: 0.1,
				}),
			});
			const data = (await aiResponse.json()) as any;
			return c.json({ platform: data.choices?.[0]?.message?.content?.trim() || "ChatGPT" });
		} catch (e) {
			return c.json({ platform: "ChatGPT" });
		}
	}
}
