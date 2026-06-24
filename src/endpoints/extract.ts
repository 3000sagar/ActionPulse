import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { type AppEnv } from "../types";

type RawActionItem = {
	task?: string;
	category?: string;
	owner?: string;
	deadline?: string;
	priority?: string;
	priority_score?: number;
	impact?: string;
	dependencies?: string[];
	steps?: string[];
	ai_prompt?: string;
	ai_platform?: string;
	estimated_time?: string;
};

export class Extract extends OpenAPIRoute {
	schema = {
		tags: ["AI"],
		summary: "Extract action items from meeting notes",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							notes: z.string().optional(),
							imageBase64: z.string().optional(),
							meetingName: z.string().optional(),
							attendees: z.string().optional(),
						}),
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Returns extracted summary and action items",
				content: {
					"application/json": {
						schema: z.object({
							summary: z.string(),
							action_items: z.array(
								z.object({
									task: z.string(),
									category: z.string(),
									owner: z.string(),
									deadline: z.string(),
									priority: z.string(),
									priority_score: z.number(),
									impact: z.string().optional(),
									dependencies: z.array(z.string()).optional(),
									steps: z.array(z.string()).optional(),
									ai_prompt: z.string(),
									ai_platform: z.string(),
									estimated_time: z.string().optional(),
								}),
							),
						}),
					},
				},
			},
			"400": { description: "Invalid input" },
			"500": { description: "Server error" },
		},
	};

	async handle(c: Context<AppEnv>) {
		const groqKey = c.env.GROQ_API_KEY;

		if (!groqKey) {
			return c.json({ error: "Server misconfigured (GROQ_API_KEY missing)" }, 500);
		}

		const { notes, imageBase64, meetingName, attendees } = await c.req.json<{
			notes?: string;
			imageBase64?: string;
			meetingName?: string;
			attendees?: string;
		}>();

		if ((!notes || notes.trim().length < 10) && !imageBase64) {
			return c.json({ error: "Please provide meeting notes or an image" }, 400);
		}

		const safeMeetingName = meetingName?.trim() || "Untitled Meeting";
		const context = [meetingName ? `Meeting: ${meetingName}` : "", attendees ? `Attendees: ${attendees}` : ""]
			.filter(Boolean)
			.join("\n");

		const prompt = buildPrompt({
			notes: notes || "[Notes provided via image]",
			meetingName: safeMeetingName,
			context,
		});

		try {
			const model = imageBase64 ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";
			
			let messageContent: any = prompt;
			if (imageBase64) {
				// Ensure base64 string has the correct data URI prefix if it's missing
				const base64Data = imageBase64.startsWith("data:image") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
				messageContent = [
					{ type: "text", text: prompt },
					{ type: "image_url", image_url: { url: base64Data } }
				];
			}

			const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${groqKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: model,
					messages: [{ role: "user", content: messageContent }],
					temperature: 0.2,
				}),
			});

			if (!aiResponse.ok) {
				throw new Error(`AI error: ${await aiResponse.text()}`);
			}

			const data = await aiResponse.json() as {
				choices?: Array<{ message?: { content?: string } }>;
				error?: { message?: string };
			};

			if (data.error?.message) {
				throw new Error(`AI API error: ${data.error.message}`);
			}

			const raw = cleanModelOutput(data.choices?.[0]?.message?.content || "");
			if (!raw) {
				throw new Error("AI returned empty response");
			}

			const jsonPayload = extractJsonPayload(raw);
			if (!jsonPayload) {
				throw new Error("AI returned invalid JSON format");
			}

			const parsed = JSON.parse(jsonPayload) as {
				summary?: string;
				action_items?: RawActionItem[];
			};

			const summary = typeof parsed.summary === "string" && parsed.summary.trim()
				? parsed.summary
				: "Summary unavailable.";
			const actionItems = Array.isArray(parsed.action_items)
				? parsed.action_items.map(normalizeActionItem)
				: [];

			// Save to D1 meetings table
			try {
				const user = c.get("user");
				if (user) {
					const meetingId = crypto.randomUUID();
					await c.env.DB.prepare(
						"INSERT INTO meetings (id, user_id, meeting_name, source, transcript, summary, action_items) VALUES (?, ?, ?, ?, ?, ?, ?)"
					).bind(
						meetingId,
						user.id,
						safeMeetingName,
						imageBase64 ? "image" : "text",
						notes || null,
						summary,
						JSON.stringify(actionItems)
					).run();
				}
			} catch (dbErr) {
				console.error("Failed to save meeting:", (dbErr as Error).message);
				// Don't fail the request if DB save fails
			}

			return c.json({
				summary,
				action_items: actionItems,
			});
		} catch (error) {
			console.error("AI ERROR:", (error as Error).message);
			return c.json({
				summary: "Unable to generate summary.",
				action_items: [],
			});
		}
	}
}

function buildPrompt(input: {
	notes: string;
	meetingName: string;
	context: string;
}) {
	return `
You are ActionPulse, an expert meeting operations assistant.

Your job is to transform messy meeting notes into a concise summary and practical action items.

STRICT OUTPUT RULES
- Return only valid JSON.
- No markdown, no explanations, no backticks.
- Output must start with { and end with }.

OUTPUT STRUCTURE
{
  "summary": "Concise summary of the meeting in 2-3 sentences",
  "action_items": [
    {
      "task": "Clear outcome-driven task starting with a strong verb",
      "category": "engineering | design | marketing | product | operations | research | other",
      "owner": "Person responsible or 'Unassigned'",
      "deadline": "Exact date or intelligently inferred or 'Not specified'",
      "priority": "high | medium | low",
      "priority_score": 1-10,
      "impact": "Why this task matters",
      "dependencies": ["Relevant blockers or related tasks if any"],
      "steps": ["3-5 practical execution steps"],
      "ai_prompt": "A useful AI prompt the user can copy to accelerate this task",
      "ai_platform": "The best AI platform for this task",
      "estimated_time": "Rough effort estimate"
    }
  ]
}

INTELLIGENCE RULES
1. Extract all explicit action items.
2. Infer missing owners only when strongly supported by context.
3. Infer deadlines only when clearly hinted.
4. Assign realistic priority based on urgency and business impact.
5. Use priority_score bands:
   - 9-10 = critical/blocking
   - 7-8 = high importance
   - 4-6 = medium
   - 1-3 = low

TASK CATEGORIES
- engineering -> backend, APIs, bugs
- design -> UI/UX, visuals
- marketing -> campaigns, content
- product -> planning, features
- operations -> coordination, execution
- research -> analysis, info gathering

AI PROMPT RULES
- Be directly usable without editing.
- Include full context from the meeting.
- Specify role, goal, constraints, and expected output.
- Keep the result practical and professional.

CONTEXT
Meeting name: ${input.meetingName}
${input.context ? `${input.context}\n` : ""}

MEETING NOTES
${input.notes}
`;
}

function cleanModelOutput(raw: string) {
	return raw
		.replace(/```json\n?/g, "")
		.replace(/```\n?/g, "")
		.trim();
}

function extractJsonPayload(raw: string): string | null {
	const objectStart = raw.indexOf("{");
	const objectEnd = raw.lastIndexOf("}");

	if (objectStart !== -1 && objectEnd !== -1 && objectStart <= objectEnd) {
		return raw.slice(objectStart, objectEnd + 1);
	}

	const arrayStart = raw.indexOf("[");
	const arrayEnd = raw.lastIndexOf("]");

	if (arrayStart !== -1 && arrayEnd !== -1 && arrayStart <= arrayEnd) {
		return raw.slice(arrayStart, arrayEnd + 1);
	}

	return null;
}

function normalizeActionItem(item: RawActionItem) {
	const priority =
		item.priority && ["high", "medium", "low"].includes(item.priority)
			? item.priority
			: "medium";

	return {
		task: item.task || "Undefined task",
		category: item.category || "other",
		owner: item.owner || "Unassigned",
		deadline: item.deadline || "Not specified",
		priority,
		priority_score: item.priority_score || 5,
		impact: item.impact || "",
		dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
		steps: Array.isArray(item.steps) ? item.steps : [],
		ai_prompt: item.ai_prompt || "",
		ai_platform: item.ai_platform || "ChatGPT",
		estimated_time: item.estimated_time || "Not specified",
	};
}
