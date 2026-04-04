// ─────────────────────────────────────────────────────────────
// Wubble Video Analysis Pipeline (SERVER-SIDE ONLY)
// Upload → Analyze → Poll → Parse → Structured JSON
//
// This module runs exclusively on the server.
// The API key is read from process.env.WUBBLE_API_KEY
// and is NEVER exposed to the browser.
// ─────────────────────────────────────────────────────────────

const API_BASE = "https://api.wubble.ai/api/v1";

function getAuthHeaders(): Record<string, string> {
  const key = process.env.WUBBLE_API_KEY;
  if (!key) {
    console.error("[Wubble] ⚠️  WUBBLE_API_KEY is not set in environment");
    throw new Error("Missing WUBBLE_API_KEY");
  }
  return { Authorization: `Bearer ${key}` };
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type VideoAnalysis = {
  mood: string;
  energy: number;
  tempo: number;
  style: string;
  instruments: string[];
  pacing: string;
  arc: string;
};

// ─────────────────────────────────────────────────────────────
// STEP 1 — Upload Video
// POST /api/v1/upload  (form-data, key: "file")
// Returns: { data: { gsutilUri: "gs://..." } }
// ─────────────────────────────────────────────────────────────

export async function uploadVideo(fileBuffer: Buffer, fileName: string, mimeType: string = "video/mp4"): Promise<string> {
  console.log(`[Wubble] 📤 Uploading video: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB) [${mimeType}]`);

  const uint8 = new Uint8Array(fileBuffer);
  const blob = new Blob([uint8], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, fileName);

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error("[Wubble] ❌ Upload failed:", res.status, errText);
    throw new Error(`Upload failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  console.log("[Wubble] ✅ Upload response:", JSON.stringify(json));

  const gsUri = json?.data?.gsutilUri;
  if (!gsUri) {
    console.error("[Wubble] ❌ No gsutilUri in response:", json);
    throw new Error("Upload succeeded but no gsutilUri returned");
  }

  console.log("[Wubble] 📍 Video URI:", gsUri);
  return gsUri;
}

// ─────────────────────────────────────────────────────────────
// STEP 2 — Analyze Video
// POST /api/v1/chat  with videos[] field
// May return direct response OR request_id for polling
//
// IMPORTANT: The model sometimes ignores JSON instructions
// and generates music instead. We handle this with:
//   1. A very explicit prompt
//   2. A retry with a correction prompt if response isn't JSON
//   3. A text-inference fallback as last resort
// ─────────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `You are a film scene analyst.

IMPORTANT RULES:

* DO NOT generate music
* DO NOT suggest samples
* DO NOT return audio URLs
* DO NOT behave like a music generator
* ONLY return structured analysis

Analyze the provided video and return ONLY JSON.

Format strictly:

{
"mood": "...",
"energy": 0.0-1.0,
"tempo": number,
"style": "...",
"instruments": ["..."],
"pacing": "...",
"arc": "..."
}

Return ONLY JSON.
No text before or after.`;

export async function analyzeVideo(videoUrl: string): Promise<{ text: string; projectId: string }> {
  console.log("[Wubble] 🔍 Sending video for analysis:", videoUrl);

  const response = await sendChatRequest(ANALYSIS_PROMPT, [videoUrl]);
  const responseText = response.text;

  const contaminated =
    responseText.includes("http") ||
    responseText.includes("sample") ||
    responseText.includes("audio") ||
    responseText.includes(".m4a") ||
    responseText.includes(".mp3");

  if (contaminated) {
    console.warn("⚠️ Contaminated project — resetting project_id");
    return {
      text: inferAnalysisFromText(responseText),
      projectId: null as unknown as string, // Force new project by stripping the ID at the pipeline level 
    };
  }

  // Check if it contains JSON
  if (responseText.match(/\{[\s\S]*"mood"[\s\S]*\}/)) {
    console.log("[Wubble] ✅ Analysis returned JSON");
    return response;
  }

  console.warn("[Wubble] ⚠️  Response was not JSON, using text inference fallback");
  console.warn("[Wubble] ⚠️  Got:", response.text.substring(0, 200));

  // If invalid JSON, immediately infer analysis from the freeform text.
  // DO NOT retry by sending another /chat request to prevent Wubble API 409 conflicts.
  return {
    text: inferAnalysisFromText(response.text),
    projectId: response.projectId
  };
}

// Send a chat request and handle direct vs async response
async function sendChatRequest(prompt: string, videos?: string[], projectId?: string, responseType: "text" | "audio" = "text"): Promise<{ text: string; projectId: string }> {
  const body: Record<string, unknown> = { prompt };
  if (videos && videos.length > 0) {
    body.videos = videos;
  }
  if (projectId) {
    body.project_id = projectId;
  }
  if (responseType === "text") {
    body.response_type = "text";
    body.vocals = false;
    body.vo = false;
  }

  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error("[Wubble] ❌ Chat request failed:", res.status, errText);
    throw new Error(`Chat request failed (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const resProjectId = json.project_id || projectId || "";
  console.log("[Wubble] 📨 Chat response:", JSON.stringify(json).substring(0, 500));

  if (json.model_response) {
    return { text: json.model_response, projectId: resProjectId };
  }

  if (json.request_id) {
    console.log("[Wubble] ⏳ Got request_id, polling:", json.request_id);
    console.log("[Wubble] 📍 Captured project_id from chat response:", resProjectId);
    const pollRes = await pollForResult(json.request_id, responseType);

    if (typeof pollRes === 'object' && pollRes !== null && 'text' in pollRes) {
      // IMPORTANT: Always prefer resProjectId — polling fallbacks return projectId: undefined
      return { text: pollRes.text, projectId: pollRes.projectId || resProjectId };
    }

    return { text: pollRes as string, projectId: resProjectId };
  }

  console.warn("[Wubble] ⚠️  Unexpected response shape:", json);
  return {
    text: inferAnalysisFromText("fallback"),
    projectId: resProjectId
  };
}

// Infer structured analysis from freeform model text
function inferAnalysisFromText(text: string): string {
  console.log("[Wubble] 🔮 Inferring analysis from freeform text...");

  const lower = text.toLowerCase();

  // Mood detection
  const moodKeywords: Record<string, string[]> = {
    calm: ["calm", "peaceful", "serene", "relaxed", "gentle", "soft", "chill", "laid-back"],
    energetic: ["energetic", "upbeat", "exciting", "dynamic", "vibrant", "lively", "fast"],
    melancholic: ["sad", "melancholic", "somber", "emotional", "dark", "moody"],
    intense: ["intense", "dramatic", "powerful", "heavy", "aggressive", "strong"],
    uplifting: ["uplifting", "happy", "joyful", "bright", "cheerful", "positive", "hopeful"],
    mysterious: ["mysterious", "ethereal", "ambient", "haunting", "eerie"],
  };

  let mood = "cinematic";
  for (const [m, keywords] of Object.entries(moodKeywords)) {
    if (keywords.some(k => lower.includes(k))) { mood = m; break; }
  }

  // Energy from keywords
  let energy = 0.5;
  if (lower.match(/high.energy|fast|intense|powerful|dynamic/)) energy = 0.8;
  else if (lower.match(/low.energy|calm|slow|gentle|relaxed|chill|laid-back/)) energy = 0.3;
  else if (lower.match(/moderate|medium|steady/)) energy = 0.5;

  // Style
  let style = "cinematic";
  const styleMap: Record<string, string[]> = {
    lofi: ["lofi", "lo-fi", "chill", "laid-back", "focus"],
    orchestral: ["orchestra", "strings", "brass", "symphon"],
    electronic: ["electronic", "synth", "edm", "beat"],
    acoustic: ["acoustic", "folk", "guitar"],
    ambient: ["ambient", "atmospheric", "ethereal"],
  };
  for (const [s, keywords] of Object.entries(styleMap)) {
    if (keywords.some(k => lower.includes(k))) { style = s; break; }
  }

  const inferred = JSON.stringify({
    mood,
    energy,
    tempo: energy > 0.6 ? 120 : energy > 0.4 ? 95 : 72,
    style,
    instruments: ["piano", "strings", "ambient pads"],
    pacing: energy > 0.6 ? "moderate" : "slow",
    arc: "steady",
  });

  console.log("[Wubble] 🔮 Inferred:", inferred);
  return inferred;
}

// ─────────────────────────────────────────────────────────────
// STEP 3 & 5 — Poll for async result
// GET /api/v1/polling/{request_id}
// ─────────────────────────────────────────────────────────────

type PollResult = string | { text: string; projectId: undefined };

async function pollForResult(requestId: string, expectedType: "text" | "audio" = "audio"): Promise<PollResult> {
  const POLL_INTERVAL_MS = 2000;
  const MAX_POLLS = 90; // 3 minutes max

  for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    console.log(`[Wubble] 🔄 Polling attempt ${attempt}/${MAX_POLLS} for request: ${requestId}`);

    const endpoint = `${API_BASE}/polling/${requestId}`;

    const res = await fetch(endpoint, {
      method: "GET",
      headers: { ...getAuthHeaders() },
    });

    if (!res.ok) {
      console.warn(`[Wubble] ⚠️  Poll returned ${res.status}, retrying...`);
      continue;
    }

    const response = await res.json();
    console.log(`[Wubble] 📊 Poll status:`, response.status || "unknown");

    if (response.status === "processing") {
      if (attempt > 60 && expectedType === "text") {
        console.warn("⚠️ Timeout — fallback");
        return {
          text: inferAnalysisFromText("fallback"),
          projectId: undefined
        };
      }
      continue;
    }

    if (response.status === "streaming") {
      // Check if streaming has actually completed (final_audio_url present)
      if (expectedType === "audio" && response.streaming?.final_audio_url) {
        console.log("[Wubble] ✅ Streaming completed with final_audio_url");
        return response.streaming.final_audio_url;
      }
      if (expectedType === "text") {
        if (attempt > 60) {
          console.warn("⚠️ Streaming timed out — forcing fallback");
          return {
            text: inferAnalysisFromText(response.model_response || "fallback"),
            projectId: undefined
          };
        }
        // Wait until it officially hits "completed" so Wubble unlocks the project_id
        console.log("[Wubble] ⏳ Waiting for Wubble to finalize analysis...");
        continue;
      } else {
        if (attempt > 60) {
          console.warn("⚠️ Generation stuck in streaming — forcing retry");
          throw new Error("Generation stuck in streaming");
        }
      }
      continue;
    }

    if (response.status === "completed") {
      console.log("[Wubble] ✅ Polling complete");

      if (expectedType === "text") {
        if (response.response_type === "generation" || response.generation_type) {
          console.warn("⚠️ Generation detected during analysis — fallback");
          return {
            text: inferAnalysisFromText(response.model_response || "fallback"),
            projectId: undefined
          };
        }

        if (!response.model_response) {
          console.warn("⚠️ Missing model_response — fallback");
          return {
            text: inferAnalysisFromText("fallback"),
            projectId: undefined
          };
        }

        return typeof response.model_response === "string" ? response.model_response : JSON.stringify(response.model_response);
      }

      if (expectedType === "audio") {
        console.log("[Wubble] 🔍 Extracting audio URL from completed response...");

        // Try all known audio URL paths from the API response
        const audioUrl =
          // Direct streaming final URL (most reliable for gen5)
          response.streaming?.final_audio_url ||
          // From results.custom_data.audios array
          response.results?.custom_data?.audios?.[0]?.audio_url ||
          // Legacy paths
          response.audio_url ||
          response.data?.results?.audio_url ||
          response.results?.audio_url ||
          response.data?.results?.custom_data?.audio_url ||
          response.results?.custom_data?.audio_url;

        if (audioUrl) {
          console.log("[Wubble] 🎵 Found audio URL:", audioUrl);
          return audioUrl;
        }

        console.error("[Wubble] ❌ No audio URL found. Full response:\n", JSON.stringify(response, null, 2));
        throw new Error("Invalid music generation response — missing audio_url");
      }

      console.error("[Wubble] ❌ Payload unrecognized. Full response:\n", JSON.stringify(response, null, 2));
      throw new Error(`Polling completed but couldn't parse expected type: ${expectedType}`);
    }

    if (response.status === "failed" || response.status === "error") {
      const errMsg = typeof response.error === 'object'
        ? (response.error?.message || JSON.stringify(response.error))
        : (response.error || response.message || "unknown error");
      console.error("[Wubble] ❌ Request failed:", errMsg);
      if (expectedType === "text") {
        console.warn("⚠️ Error state — fallback");
        return { text: inferAnalysisFromText("fallback"), projectId: undefined };
      }
      throw new Error(`Request failed: ${errMsg}`);
    }
  }

  if (expectedType === "text") {
    console.warn("⚠️ Timeout — fallback");
    return { text: inferAnalysisFromText("fallback"), projectId: undefined };
  }

  throw new Error(`Polling timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s`);
}

// ─────────────────────────────────────────────────────────────
// STEP 4 — Parse model_response string → structured JSON
// ─────────────────────────────────────────────────────────────

export function parseAnalysisResponse(raw: string): VideoAnalysis {
  console.log("[Wubble] 🧹 Parsing model_response:", raw.substring(0, 300));

  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  // Extract JSON object
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[Wubble] ❌ No JSON object found in response:", cleaned);
    throw new Error("Could not extract JSON from model response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const analysis: VideoAnalysis = {
      mood: String(parsed.mood || "unknown"),
      energy: Number(parsed.energy) || 0,
      tempo: Number(parsed.tempo) || 0,
      style: String(parsed.style || "unknown"),
      instruments: Array.isArray(parsed.instruments) ? parsed.instruments.map(String) : [],
      pacing: String(parsed.pacing || "unknown"),
      arc: String(parsed.arc || "unknown"),
    };

    console.log("[Wubble] ✅ Parsed analysis:", JSON.stringify(analysis, null, 2));
    return analysis;
  } catch (e) {
    console.error("[Wubble] ❌ JSON parse failed:", e, "\nRaw:", jsonMatch[0]);
    throw new Error("Failed to parse analysis JSON");
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN ENTRY — Full pipeline (server-side only)
// ─────────────────────────────────────────────────────────────

export async function getVideoAnalysis(fileBuffer: Buffer, fileName: string, mimeType: string = "video/mp4"): Promise<{ analysis: VideoAnalysis; projectId: string }> {
  console.log("\n[Wubble] ═══════════════════════════════════════");
  console.log("[Wubble] 🎬 Starting video analysis pipeline");
  console.log("[Wubble] ═══════════════════════════════════════\n");

  const gsUri = await uploadVideo(fileBuffer, fileName, mimeType);
  const result = await analyzeVideo(gsUri);
  const analysis = parseAnalysisResponse(result.text);

  console.log("\n[Wubble] ═══════════════════════════════════════");
  console.log("[Wubble] 🎉 Pipeline complete!");
  console.log("[Wubble] ═══════════════════════════════════════\n");

  return { analysis, projectId: result.projectId };
}

// ─────────────────────────────────────────────────────────────
// STEP 5 — Generate Music
// POST /api/v1/chat  with custom prompt + project_id
// ─────────────────────────────────────────────────────────────

export async function generateMusic(projectId: string, prompt: string): Promise<string> {
  console.log("\n[Wubble] ═══════════════════════════════════════");
  console.log("[Wubble] 🎵 Generating soundtrack");
  console.log("[Wubble] ═══════════════════════════════════════\n");

  const body: Record<string, unknown> = { prompt, vocals: true, vo: true };
  if (projectId) {
    body.project_id = projectId;
  }

  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`[Wubble] ❌ Music gen failed (${res.status}): ${errText}`);
    throw new Error("Music generation request failed");
  }

  const json = await res.json();
  let audioUrl: string | undefined;

  if (json.request_id) {
    console.log("[Wubble] ⏳ Polling for music generation:", json.request_id);
    audioUrl = (await pollForResult(json.request_id, "audio")) as string;
  } else {
    // If it completed instantly without polling
    audioUrl = json.results?.custom_data?.audio_url ||
      json.results?.custom_data?.audios?.[0]?.audio_url ||
      json.streaming?.final_audio_url;
    if (!audioUrl) {
      console.error("[Wubble] ❌ No audio_url found in immediate result. Full response:\n", JSON.stringify(json, null, 2));
      throw new Error("Failed to extract audio_url from immediate generation response");
    }
  }

  console.log("[Wubble] ✅ Music generation complete! URL:", audioUrl);
  if (!audioUrl) throw new Error("Audio generation returned empty result");
  return audioUrl;
}

// ─────────────────────────────────────────────────────────────
// STEP 6 — Refine Music (Director Mode)
// POST /api/v1/chat  with user direction + SAME project_id
// This maintains continuity — Wubble uses project_id to
// remember the previous generation and apply refinements.
// ─────────────────────────────────────────────────────────────

export async function refineMusic(projectId: string, userDirection: string): Promise<string> {
  console.log("\n[Wubble] ═══════════════════════════════════════");
  console.log("[Wubble] 🎬 Director Mode — Refining soundtrack");
  console.log("[Wubble] 📝 Direction:", userDirection);
  console.log("[Wubble] 📍 Project:", projectId);
  console.log("[Wubble] ═══════════════════════════════════════\n");

  if (!projectId) {
    throw new Error("Cannot refine without a project_id — generate first");
  }

  const body: Record<string, unknown> = {
    prompt: userDirection,
    project_id: projectId,
    vocals: true,
    vo: true,
  };

  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error(`[Wubble] ❌ Refinement failed (${res.status}): ${errText}`);
    try {
      const errJson = JSON.parse(errText);
      const msg = errJson?.error?.message || errJson?.message || errText;
      throw new Error(msg);
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message !== errText) throw parseErr;
      throw new Error(`Music refinement failed (${res.status})`);
    }
  }

  const json = await res.json();
  let audioUrl: string | undefined;

  if (json.request_id) {
    console.log("[Wubble] ⏳ Polling for refinement:", json.request_id);
    audioUrl = (await pollForResult(json.request_id, "audio")) as string;
  } else {
    audioUrl = json.results?.custom_data?.audio_url ||
      json.results?.custom_data?.audios?.[0]?.audio_url ||
      json.streaming?.final_audio_url;
    if (!audioUrl) {
      console.error("[Wubble] ❌ No audio_url in refinement response:\n", JSON.stringify(json, null, 2));
      throw new Error("Failed to extract audio_url from refinement response");
    }
  }

  console.log("[Wubble] ✅ Refinement complete! URL:", audioUrl);
  if (!audioUrl) throw new Error("Refinement returned empty result");
  return audioUrl;
}
