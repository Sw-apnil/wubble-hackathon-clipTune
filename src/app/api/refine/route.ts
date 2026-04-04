import { refineMusic } from "@/lib/api";

export const dynamic = "force-dynamic";

export const maxDuration = 180; // 3 minutes max for long polling

export async function POST(request: Request) {
  try {
    const { projectId, direction } = await request.json();

    if (!projectId) {
      return Response.json(
        { error: "Missing projectId — cannot refine without an existing project" },
        { status: 400 }
      );
    }

    if (!direction || !direction.trim()) {
      return Response.json(
        { error: "Missing direction — tell the AI what to change" },
        { status: 400 }
      );
    }

    console.log(`[API /refine] 🎬 Director Mode for project: ${projectId}`);
    console.log(`[API /refine] 📝 Direction: "${direction}"`);

    const audioUrl = await refineMusic(projectId, direction);

    console.log(`[API /refine] ✅ Refinement complete:`, audioUrl);

    return Response.json({ success: true, audioUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API /refine] ❌ Failed:", message);

    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
