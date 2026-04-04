import { useState, useEffect, useCallback } from "react";
import { Project, Version } from "@/lib/types";

const STORAGE_KEY = "cliptune_projects_v1";
const ACTIVE_PROJECT_KEY = "cliptune_current_project_id_v1";

const generateId = () => Math.random().toString(36).substring(2, 9);

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize from LocalStorage
  const initializeApp = useCallback(() => {
    try {
      const storedProjects = localStorage.getItem(STORAGE_KEY);
      const storedActiveId = localStorage.getItem(ACTIVE_PROJECT_KEY);
      
      let parsedProjects: Project[] = [];
      if (storedProjects) {
        parsedProjects = JSON.parse(storedProjects);
        setProjects(parsedProjects);
      }

      if (parsedProjects.length > 0 && storedActiveId) {
        // Ensure active project still exists
        if (parsedProjects.find(p => p.id === storedActiveId)) {
          setCurrentProjectId(storedActiveId);
        } else {
           setCurrentProjectId(parsedProjects[0].id);
        }
      } else if (parsedProjects.length > 0) {
        setCurrentProjectId(parsedProjects[0].id);
      } else {
        // Run Case A: No data, create a fresh idle project
        createNewProject();
      }
    } catch(e) {
      console.error("Storage corrupt, resetting...", e);
      createNewProject();
    }
    
    setIsLoaded(true);
  }, []);

  // Save to LocalStorage whenever `projects` change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      if (currentProjectId) {
         localStorage.setItem(ACTIVE_PROJECT_KEY, currentProjectId);
      }
    }
  }, [projects, currentProjectId, isLoaded]);

  const updateCurrentProject = useCallback((updater: (proj: Project) => Project) => {
    setProjects(prev => prev.map(p => {
      if (p.id === currentProjectId) return updater(p);
      return p;
    }));
  }, [currentProjectId]);

  const createNewProject = useCallback(() => {
    const newProj: Project = {
      id: generateId(),
      createdAt: Date.now(),
      videoFileUrl: null,
      status: "idle",
      analysisData: null,
      versions: []
    };
    setProjects(prev => [...prev, newProj]);
    setCurrentProjectId(newProj.id);
  }, []);

  const attachVideoToProject = useCallback((url: string) => {
    updateCurrentProject(p => ({
      ...p,
      videoFileUrl: url,
      status: "analyzing"
    }));
  }, [updateCurrentProject]);

  const updateAnalysis = useCallback((reasoning: string, moodTags: string[]) => {
    updateCurrentProject(p => ({
      ...p,
      status: "generating", // We skip 'analyzed' in UX for continuity speed, but we can set it to generating immediately
      analysisData: { reasoning, moodTags }
    }));
  }, [updateCurrentProject]);

  const addVersion = useCallback((songTitle: string, outputTags: string[], promptUsed: string | null = null, audioUrl: string = "dummy-audio.mp3") => {
    updateCurrentProject(p => {
      const nextLabel = `V${p.versions.length + 1}`;
      
      const newVersion: Version = {
         versionId: generateId(),
         label: nextLabel,
         songTitle,
         audioUrl: audioUrl,
         promptUsed,
         createdAt: Date.now(),
         outputTags
      };

      return {
        ...p,
        status: "generated",
        versions: [...p.versions, newVersion]
      };
    });
  }, [updateCurrentProject]);

  const refineProjectContext = useCallback((promptContent: string) => {
    // Sets the status back to 'refining' immediately
    updateCurrentProject(p => ({
      ...p,
      status: "refining"
    }));
  }, [updateCurrentProject]);

  const currentProject = projects.find(p => p.id === currentProjectId) || null;

  return {
    isLoaded,
    projects,
    currentProject,
    initializeApp,
    createNewProject,
    setCurrentProjectId,
    attachVideoToProject,
    updateAnalysis,
    addVersion,
    refineProjectContext,
  };
}
