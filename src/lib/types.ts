export type Version = {
  versionId: string;
  label: string; // V1, V2
  songTitle: string;
  audioUrl: string;
  promptUsed: string | null;
  createdAt: number;
  outputTags: string[]; // E.g. ["🎻 Orchestral", "🎬 Dark"]
};

export type ProjectStatus = "idle" | "analyzing" | "analyzed" | "generating" | "refining" | "generated";

export type Project = {
  id: string;
  createdAt: number;
  videoFileUrl: string | null;
  status: ProjectStatus;
  wubbleProjectId: string | null; // Wubble API project_id for continuity across refinements
  analysisData: {
    reasoning: string;
    moodTags: string[];
  } | null;
  versions: Version[];
};
