import { generateMusic } from "@/lib/api";

export const dynamic = "force-dynamic";

export const maxDuration = 180; // 3 minutes max for long polling

export async function POST(request: Request) {
  try {
    const { projectId, prompt } = await request.json();

    if (!prompt) {
      return Response.json(
        { error: "Missing prompt" },
        { status: 400 }
      );
    }

    console.log(`[API /generate] Triggering music gen for project: ${projectId}`);
    let audioUrl: string;
    try {
      audioUrl = await generateMusic(projectId, prompt);
    } catch (e) {
      console.warn("⚠️ Retrying generation with fresh project");
      audioUrl = await generateMusic(undefined as any, prompt); // 🔥 NEW PROJECT
    }

    return Response.json({ success: true, audioUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API /generate] ❌ Failed:", message);

    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
