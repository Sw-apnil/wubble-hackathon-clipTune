"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, Music, Play, Pause, Activity, Download, Wand2, ArrowRight,
  Sparkles, Cpu, ChevronDown, Plus, Clock, AlertCircle,
  Gauge, Zap, Mic2, BarChart3, TrendingUp, Palette
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useProjects } from "@/hooks/use-projects";

// ─────────────────────────────────────────────────────────────
// Types (mirrored from server — no direct import to avoid
// pulling server code into the client bundle)
// ─────────────────────────────────────────────────────────────

type VideoAnalysis = {
  mood: string;
  energy: number;
  tempo: number;
  style: string;
  instruments: string[];
  pacing: string;
  arc: string;
};

type AnalysisState = "idle" | "uploading" | "analyzing" | "generating" | "completed" | "error";

// ─────────────────────────────────────────────────────────────
// Loading stage messages for cinematic feel
// ─────────────────────────────────────────────────────────────

const LOADING_STAGES = [
  { text: "Uploading video…", delay: 0 },
  { text: "Analyzing cinematic elements…", delay: 3000 },
  { text: "Understanding emotional tone…", delay: 8000 },
  { text: "Extracting music direction…", delay: 14000 },
  { text: "Building scene intelligence…", delay: 22000 },
];

export default function ClipTuneApp() {
  const {
    isLoaded, projects, currentProject, initializeApp, createNewProject,
    setCurrentProjectId, attachVideoToProject, updateAnalysis,
    addVersion, refineProjectContext
  } = useProjects();

  // ── Core analysis state ──
  const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
  const [analysisResult, setAnalysisResult] = useState<VideoAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  // ── Progress UI ──
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState("");

  // ── Refinement (stubbed) ──
  const [refineInput, setRefineInput] = useState("");

  // ── Audio ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ── Navigation ──
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeVersionIndex, setActiveVersionIndex] = useState<number>(-1);

  // ── Drag & drop ──
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => { initializeApp(); }, [initializeApp]);

  // Audio visualizer loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && audioRef.current) {
      interval = setInterval(() => {
        if (audioRef.current && audioRef.current.duration) {
          setAudioCurrentTime((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
      }, 50);
    } else if (isPlaying) {
      interval = setInterval(() => {
        setAudioCurrentTime((prev) => (prev >= 100 ? 0 : prev + 1));
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlaying, activeVersionIndex]);

  const handlePlayPause = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Playback failed:", err);
      }
    }
  };

  // Auto-select latest version
  useEffect(() => {
    if (currentProject && currentProject.versions.length > 0) {
      setActiveVersionIndex(currentProject.versions.length - 1);
    } else {
      setActiveVersionIndex(-1);
    }
  }, [currentProject?.versions.length]);

  const audioUrl = currentProject?.versions?.[currentProject.versions.length - 1]?.audioUrl;

  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;

    const audio = audioRef.current;
    audio.src = audioUrl;

    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    };
  }, [audioUrl]);

  // ─────────────────────────────────────────────────────────────
  // CORE: Handle video upload → calls /api/analyze server route
  // ─────────────────────────────────────────────────────────────

  const handleUploadFile = useCallback(async (file: File) => {
    // Reset state
    setAnalysisState("uploading");
    setAnalysisResult(null);
    setErrorMessage("");
    setProgress(0);
    setIsPlaying(false);
    setAudioCurrentTime(0);
    setLoadingText(LOADING_STAGES[0].text);

    // Set project visual state
    attachVideoToProject(URL.createObjectURL(file));

    // Start smooth progress animation
    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p < 30) return p + 1.5;
        if (p < 60) return p + 0.6;
        if (p < 85) return p + 0.3;
        if (p < 95) return p + 0.1;
        return p;
      });
    }, 300);

    // Stage text transitions for cinematic feel
    const stageTimeouts = LOADING_STAGES.slice(1).map(stage =>
      setTimeout(() => {
        setLoadingText(stage.text);
        if (stage.delay > 3000) setAnalysisState("analyzing");
      }, stage.delay)
    );

    try {
      // Build FormData and send to our server route
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      // Cleanup timers
      clearInterval(progressInterval);
      stageTimeouts.forEach(clearTimeout);

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Analysis failed");
      }

      const analysis: VideoAnalysis = data.analysis;

      // Post-analysis UI update
      setAnalysisResult(analysis);
      setAnalysisState("generating");
      setLoadingText("Generating cinematic soundtrack...");

      // Build the prompt for music generation
      const generativePrompt = `Generate a cinematic soundtrack. Mood: ${analysis.mood}. Energy: ${analysis.energy}. Tempo: ${analysis.tempo}. Style: ${analysis.style}. Instruments: ${analysis.instruments.join(', ')}. Pacing: ${analysis.pacing}. Arc: ${analysis.arc}.`;

      // Trigger music generation
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: data.projectId, prompt: generativePrompt }),
      });

      const genData = await genRes.json();

      if (!genRes.ok || !genData.success) {
        throw new Error(genData.error || "Music generation failed");
      }

      // Final Completion
      setProgress(100);
      setLoadingText("Ready!");
      setAnalysisState("completed");

      // Update project store
      updateAnalysis(
        `Mood: ${analysis.mood} | Energy: ${Math.round(analysis.energy * 100)}% | Tempo: ${analysis.tempo} BPM`,
        [analysis.style, analysis.pacing, ...analysis.instruments.slice(0, 2)].filter(Boolean)
      );

      // Add the real generated version
      addVersion(
        `${analysis.mood} — ${analysis.style}`,
        [analysis.style, `${Math.round(analysis.energy * 100)}% energy`, analysis.pacing].filter(Boolean),
        generativePrompt,
        genData.audioUrl
      );

      console.log("[ClipTune] ✅ Pipeline complete. Audio:", genData.audioUrl);
    } catch (e) {
      clearInterval(progressInterval);
      stageTimeouts.forEach(clearTimeout);

      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[ClipTune] ❌ Error:", msg);
      setErrorMessage(msg);
      setAnalysisState("error");
      setLoadingText("");
    }
  }, [attachVideoToProject, updateAnalysis, addVersion]);

  // ── Drag and drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      handleUploadFile(file);
    }
  }, [handleUploadFile]);

  // ── Director Mode stub ──
  const handleRefine = async () => {
    if (!refineInput.trim() || !currentProject) return;
    console.log("[ClipTune] 🎬 Director refinement (music gen not yet implemented):", refineInput);
    setRefineInput("");
  };

  // ── Navigation helpers ──
  const handleNewProjectMenuClick = () => {
    setIsDropdownOpen(false);
    setAnalysisState("idle");
    setAnalysisResult(null);
    createNewProject();
  };

  const handleSwitchProject = (id: string) => {
    setIsDropdownOpen(false);
    setIsPlaying(false);
    setCurrentProjectId(id);
  };

  const getElapsedTimeString = (ms: number) => {
    const diff = Date.now() - ms;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""} ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  };

  // ── Loading gate ──
  if (!isLoaded || !currentProject) return <div className="min-h-screen bg-sketch bg-opacity-10 bg-background" />;

  const isProcessing = analysisState === "uploading" || analysisState === "analyzing";
  const viewingVersion = currentProject.versions.length > 0 && activeVersionIndex >= 0
    ? currentProject.versions[activeVersionIndex]
    : null;

  return (
    <div
      className="min-h-screen bg-sketch bg-background font-sans selection:bg-primary/20 overflow-x-hidden pt-6"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* ═══ DRAG OVERLAY ═══ */}
      {isDragOver && (
        <div className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 rounded-3xl p-12 shadow-2xl border-2 border-dashed border-primary/40 text-center">
            <Upload className="w-16 h-16 text-primary mx-auto mb-4" />
            <p className="text-2xl font-semibold text-zinc-800">Drop your video here</p>
          </div>
        </div>
      )}

      {/* ═══ TOP HEADER & NAVIGATION ═══ */}
      <div className="max-w-4xl mx-auto px-6 w-full flex justify-between items-center z-50 relative mb-8">
        <div className="inline-flex items-center justify-center p-2 bg-white/60 backdrop-blur-md rounded-xl shadow-sm border border-black/5">
          <Music className="w-6 h-6 text-primary" strokeWidth={2} />
          <span className="ml-2 text-xl font-bold tracking-tight text-zinc-900 pr-1">ClipTune</span>
        </div>

        {/* Project Switcher */}
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="bg-white/80 backdrop-blur-md shadow-sm border-white/60 hover:bg-white rounded-xl h-10 px-4"
          >
            <Clock className="w-4 h-4 mr-2 text-zinc-500" />
            Recent Projects <ChevronDown className="w-4 h-4 ml-1 opacity-50" />
          </Button>

          {isDropdownOpen && (
            <div className="absolute right-0 top-12 w-64 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-primary/10 overflow-hidden animate-in zoom-in-95 duration-200 z-50">
              <div className="p-2 border-b border-zinc-100">
                <Button variant="ghost" onClick={handleNewProjectMenuClick} className="w-full justify-start text-primary font-semibold hover:text-primary hover:bg-primary/5 rounded-xl h-10">
                  <Plus className="w-4 h-4 mr-2" /> Start New Project
                </Button>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2 scrollbar-hide">
                <p className="px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Project History</p>
                {projects.sort((a, b) => b.createdAt - a.createdAt).map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => handleSwitchProject(proj.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-all mb-1 hover:bg-zinc-50
                      ${proj.id === currentProject.id ? "bg-primary/5 border border-primary/10" : "border border-transparent"}`}
                  >
                    <div className="flex justify-between items-center mb-0.5">
                      <span className={`text-sm font-semibold truncate ${proj.id === currentProject.id ? "text-primary" : "text-zinc-700"}`}>
                        {proj.versions.length > 0 ? proj.versions[proj.versions.length - 1].songTitle : "Untitled Project"}
                      </span>
                    </div>
                    <div className="flex items-center text-xs text-zinc-500">
                      {getElapsedTimeString(proj.createdAt)} • {proj.versions.length} version{proj.versions.length === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>


      <main className="max-w-4xl mx-auto px-6 pb-24 flex flex-col items-center">

        {/* ═══ HEADER ═══ */}
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700 mt-2">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-800 mb-4 transition-all">
            {analysisState === "completed"
              ? "AI understood your video."
              : "Cinematic soundtracks, generated in seconds."}
          </h1>
          <p className="text-lg text-zinc-500 max-w-xl mx-auto">
            {analysisState === "completed"
              ? "Here's what the AI sees in your footage."
              : "Drop your video. Get a perfectly timed cinematic soundtrack."}
          </p>
        </div>

        <div className="w-full max-w-2xl relative">

          {/* ═══ IDLE STATE — Upload Card ═══ */}
          {analysisState === "idle" && (
            <Card className="glass-panel border-0 shadow-xl rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-500 relative z-10 transition-all">
              <CardContent className="p-12 text-center flex flex-col items-center justify-center min-h-[320px]">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 border border-primary/20 hover:scale-105 transition-transform duration-300">
                  <Upload className="w-8 h-8 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-medium text-zinc-900 mb-2">Drag & drop your video</h3>
                <p className="text-zinc-500 mb-8 max-w-sm">MP4, MOV or WEBM up to 50MB.</p>
                <div className="relative inline-block w-full max-w-[300px]">
                  <input
                    type="file"
                    id="video-upload"
                    title="Upload video file"
                    accept="video/mp4,video/quicktime,video/webm"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    onChange={(e) => { if (e.target.files?.[0]) handleUploadFile(e.target.files[0]); }}
                  />
                  <Button
                    size="lg"
                    className="w-full relative z-10 rounded-xl px-10 py-7 text-lg font-medium shadow-[0_8px_30px_rgba(94,53,177,0.25)] bg-primary hover:bg-primary/95 transition-all duration-300 hover:scale-[1.03] active:scale-95 pointer-events-none"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Analyze Video
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}


          {/* ═══ PROCESSING STATE — Uploading / Analyzing ═══ */}
          {isProcessing && (
            <Card className="glass-panel border-0 shadow-xl rounded-3xl overflow-hidden relative z-10 transition-all duration-500 animate-in fade-in zoom-in-95">
              <CardContent className="p-10 flex flex-col items-center text-center">
                <div className="relative mb-8 mt-6">
                  <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full animate-pulse" />
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center relative shadow-md border border-primary/20">
                    <Activity className="w-10 h-10 text-primary animate-pulse" strokeWidth={1.5} />
                  </div>
                </div>

                <h3 className="text-2xl font-medium text-zinc-900 mb-2">{loadingText}</h3>

                <div className="w-full max-w-md my-8">
                  <Progress value={progress} className="h-2 bg-primary/10" />
                  <div className="flex justify-between items-center mt-3 px-1">
                    <span className="text-xs font-mono text-zinc-400 capitalize">{analysisState}…</span>
                    <span className="text-xs font-mono text-zinc-400">{Math.round(progress)}%</span>
                  </div>
                </div>

                {/* Live AI hint */}
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 w-full flex items-center gap-4 text-left shadow-[0_0_20px_rgba(94,53,177,0.08)] relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm relative border border-primary/10">
                    <div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-pulse" />
                    <Cpu className="w-5 h-5 text-primary relative z-10" />
                  </div>
                  <div className="flex-1 relative z-10">
                    <p className="text-sm font-bold uppercase text-primary tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Processing
                    </p>
                    <p className="text-sm text-zinc-600 mt-1">Analyzing visual composition, motion patterns, color grading, and emotional trajectory…</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}



          {/* ═══ ERROR STATE ═══ */}
          {analysisState === "error" && (
            <Card className="glass-panel border-0 shadow-xl rounded-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-500 relative z-10">
              <CardContent className="p-12 text-center flex flex-col items-center justify-center min-h-[280px]">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 border border-red-200">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-medium text-zinc-900 mb-2">Analysis failed. Try again.</h3>
                <p className="text-zinc-500 mb-6 max-w-sm text-sm">{errorMessage}</p>
                <Button
                  onClick={() => { setAnalysisState("idle"); setErrorMessage(""); }}
                  className="rounded-xl px-8 py-6 text-base font-medium bg-primary hover:bg-primary/95 shadow-lg"
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}


          {/* ═══ COMPLETED STATE — AI Analysis Display ═══ */}
          {(analysisState === "completed" || analysisState === "generating") && analysisResult && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700 relative z-10">

              {/* ── Analysis Header Card ── */}
              <Card className="glass-panel border-0 shadow-2xl rounded-3xl overflow-hidden relative">
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900">AI Analysis</h2>
                      <p className="text-sm text-zinc-500">Scene understanding complete</p>
                    </div>
                  </div>

                  {/* ── Analysis Grid ── */}
                  <div className="grid grid-cols-2 gap-4">

                    {/* Mood */}
                    <div className="bg-white/70 rounded-2xl p-5 border border-zinc-100 hover:shadow-md transition-all duration-300 group">
                      <div className="flex items-center gap-2 mb-3">
                        <Palette className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Mood</span>
                      </div>
                      <p className="text-lg font-semibold text-zinc-800 capitalize group-hover:text-primary transition-colors">{analysisResult.mood}</p>
                    </div>

                    {/* Style */}
                    <div className="bg-white/70 rounded-2xl p-5 border border-zinc-100 hover:shadow-md transition-all duration-300 group">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Style</span>
                      </div>
                      <p className="text-lg font-semibold text-zinc-800 capitalize group-hover:text-primary transition-colors">{analysisResult.style}</p>
                    </div>

                    {/* Energy — as a bar */}
                    <div className="bg-white/70 rounded-2xl p-5 border border-zinc-100 hover:shadow-md transition-all duration-300">
                      <div className="flex items-center gap-2 mb-3">
                        <Gauge className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Energy</span>
                      </div>
                      <div className="flex items-end gap-3">
                        <span className="text-2xl font-bold text-zinc-800">{Math.round(analysisResult.energy * 100)}%</span>
                        <div className="flex-1 h-3 bg-zinc-100 rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${analysisResult.energy * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tempo */}
                    <div className="bg-white/70 rounded-2xl p-5 border border-zinc-100 hover:shadow-md transition-all duration-300">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Tempo</span>
                      </div>
                      <p className="text-2xl font-bold text-zinc-800">{analysisResult.tempo} <span className="text-sm font-normal text-zinc-400">BPM</span></p>
                    </div>

                    {/* Pacing */}
                    <div className="bg-white/70 rounded-2xl p-5 border border-zinc-100 hover:shadow-md transition-all duration-300 group">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Pacing</span>
                      </div>
                      <p className="text-lg font-semibold text-zinc-800 capitalize group-hover:text-primary transition-colors">{analysisResult.pacing}</p>
                    </div>

                    {/* Arc */}
                    <div className="bg-white/70 rounded-2xl p-5 border border-zinc-100 hover:shadow-md transition-all duration-300 group">
                      <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Arc</span>
                      </div>
                      <p className="text-lg font-semibold text-zinc-800 capitalize group-hover:text-primary transition-colors">{analysisResult.arc}</p>
                    </div>
                  </div>

                  {/* ── Instruments row ── */}
                  {analysisResult.instruments.length > 0 && (
                    <div className="mt-5 bg-white/70 rounded-2xl p-5 border border-zinc-100">
                      <div className="flex items-center gap-2 mb-3">
                        <Mic2 className="w-4 h-4 text-primary/70" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Suggested Instruments</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.instruments.map((inst, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1.5 bg-primary/5 border border-primary/15 rounded-lg text-sm font-medium text-primary capitalize hover:bg-primary/10 transition-colors cursor-default"
                          >
                            {inst}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── STAGE 3A: Generating Music Feedback ── */}
              {analysisState === "generating" && (
                <div className="mt-8 bg-zinc-50 rounded-3xl p-8 border border-zinc-100 flex items-center gap-6 animate-pulse">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-200 flex items-center justify-center">
                    <Music className="w-8 h-8 text-zinc-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-700">🎵 Generating cinematic soundtrack...</h3>
                    <p className="text-sm text-zinc-500 font-medium">The AI is composing a unique track matching the emotional arc of your video.</p>
                  </div>
                </div>
              )}

              {/* ── Generated Soundtrack Player ── */}
              {analysisState === "completed" && currentProject?.versions && currentProject.versions.length > 0 && currentProject.versions[currentProject.versions.length - 1].audioUrl && (
                <Card className="glass-panel border border-primary/20 shadow-xl rounded-3xl overflow-hidden mt-8 relative group cursor-pointer transition-all hover:shadow-primary/10">
                  <div className="absolute inset-x-0 bottom-0 h-1bg-gradient-to-r from-primary/30 to-primary/80" />
                  <CardContent className="p-6">
                    <div className="flex items-center gap-6">
                      
                      <Button
                        onClick={handlePlayPause}
                        className="w-16 h-16 rounded-2xl bg-primary shadow-lg shadow-primary/30 hover:bg-primary/95 flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95"
                      >
                        {isPlaying ? <Pause className="w-8 h-8 text-white fill-current" /> : <Play className="w-8 h-8 text-white fill-current ml-1" />}
                      </Button>

                      <div className="flex-1">
                        <div className="flex items-end justify-between mb-2">
                          <div>
                            <p className="text-xs font-bold text-primary tracking-wider uppercase mb-1 flex items-center gap-1.5"><Music className="w-3.5 h-3.5" /> Soundtrack</p>
                            <h3 className="text-xl font-bold text-zinc-900">{currentProject.versions[currentProject.versions.length - 1].songTitle}</h3>
                          </div>
                          
                          <div className="flex flex-col items-end gap-1">
                             <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-1 rounded-md">V{currentProject.versions.length}</span>
                             <span className="text-xs font-mono font-medium text-zinc-500">{formatTime(audioCurrentTime)} / {formatTime(duration)}</span>
                          </div>
                        </div>
                        
                        {/* Audio Progress Bar */}
                        <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden mt-3 cursor-pointer relative group"
                             onClick={(e) => {
                               const rect = e.currentTarget.getBoundingClientRect();
                               const percent = (e.clientX - rect.left) / rect.width;
                               if (audioRef.current && audioRef.current.duration) {
                                 audioRef.current.currentTime = percent * audioRef.current.duration;
                               }
                             }}>
                           <div 
                             className="h-full bg-primary relative rounded-full transition-all duration-100 ease-linear"
                             style={{ width: `${duration ? (audioCurrentTime / duration) * 100 : 0}%` }}
                           >
                             <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md border-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                           </div>
                        </div>
                        
                        <div className="flex gap-2 mt-4 flex-wrap">
                          {currentProject.versions[currentProject.versions.length - 1].outputTags.map((tag, i) => (
                             <span key={i} className="text-xs bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-md capitalize">{tag}</span>
                          ))}
                        </div>
                      </div>

                      <div className="shrink-0 pl-4 border-l border-zinc-100">
                        <a 
                          href={currentProject.versions[currentProject.versions.length - 1].audioUrl} 
                          download
                          className="flex items-center justify-center w-10 h-10 text-zinc-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"
                        >
                           <Download className="w-5 h-5" />
                        </a>
                      </div>

                    </div>
                  </CardContent>

                  {/* Hidden Audio Element */}
                  <audio 
                    ref={audioRef}
                    onTimeUpdate={() => {
                      if (audioRef.current) setAudioCurrentTime(audioRef.current.currentTime);
                    }}
                    onEnded={() => setIsPlaying(false)}
                  />
                </Card>
              )}

              {analysisState === "completed" && (
                <div className="flex justify-center mt-6">
                  <Button
                    variant="ghost"
                    onClick={() => { setAnalysisState("idle"); setAnalysisResult(null); createNewProject(); }}
                    className="rounded-xl px-6 text-sm font-semibold text-zinc-500 hover:text-zinc-900"
                  >
                    Start Over
                  </Button>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

// Helper: Format Time in seconds (e.g. 125 -> "2:05")
function formatTime(time: number) {
  if (!time || isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
