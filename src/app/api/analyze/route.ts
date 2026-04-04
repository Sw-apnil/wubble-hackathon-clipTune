import { getVideoAnalysis } from "@/lib/api";

export const dynamic = "force-dynamic";

// Increase body size limit for video uploads (50MB)
export const maxDuration = 180; // 3 minutes max for long polling

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return Response.json(
        { error: "No video file provided. Send form-data with key 'file'." },
        { status: 400 }
      );
    }

    // Extract file metadata
    const fileName = file instanceof File ? file.name : "video.mp4";
    const mimeType = file.type || "video/mp4";

    console.log(`[API /analyze] Received file: ${fileName} (${(file.size / 1024 / 1024).toFixed(1)} MB) [${mimeType}]`);

    // Convert to Buffer for server-side processing
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Run the full pipeline: upload → analyze → poll → parse
    const { analysis, projectId } = await getVideoAnalysis(buffer, fileName, mimeType);

    console.log("[API /analyze] ✅ Analysis complete:", JSON.stringify(analysis));

    return Response.json({ success: true, analysis, projectId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API /analyze] ❌ Pipeline failed:", message);

    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
