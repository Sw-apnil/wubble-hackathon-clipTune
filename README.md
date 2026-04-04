# 🎬 ClipTune — AI Director for Video Soundtracks

> Turn any video into a cinematic experience with AI-generated background music.

---

## 🚨 The Problem

Adding background music to videos is frustrating:

* 🎵 You scroll endlessly through music libraries
* 🎯 Hard to match the exact mood of your scene
* 🔁 Trial and error — nothing feels “just right”
* ⏱️ Takes more time than editing the video itself

There is no tool that **understands your video** and creates music tailored to it.

---

## 💡 Our Solution

ClipTune acts like an **AI Director**.

Instead of searching for music, you:

1. Upload your video
2. AI analyzes:

   * mood
   * energy
   * pacing
   * emotional arc
3. Generates a **perfectly matched soundtrack**

---

## 🔥 What Makes It Special

### 🎬 AI Scene Understanding

The system doesn’t guess — it **analyzes your video like a filmmaker**.

---

### 🎵 Custom Soundtrack Generation

Music is generated specifically for your video — not picked from a library.

---

### 🎯 Director Mode (Game Changer)

Refine music using natural language:

* “Make it more intense”
* “Add piano”
* “More cinematic”

Each refinement creates a new version (V1 → V2 → V3)

👉 You’re not editing music — you’re **directing it**

---

## ⚙️ How It Works (Pipeline)

```text
Upload Video
   ↓
AI Video Analysis (Wubble API)
   ↓
Structured Scene Understanding
   ↓
Music Generation
   ↓
Refinement (Director Mode)
```

---

## 🧪 Tech Stack

* ⚡ Next.js (Frontend + API routes)
* 🎨 Tailwind CSS (UI)
* 🤖 Wubble API (Video analysis + music generation)
* 🧠 Custom orchestration logic (polling, fallback, refinement)

---

## 🚀 Live Demo

👉 [Your Deployed Link Here]

---

## 🛠️ Running Locally

### 1. Clone the repo

```bash
git clone https://github.com/your-username/cliptune.git
cd cliptune
```

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Add environment variables

Create a `.env` file:

```env
WUBBLE_API_KEY=your_api_key_here
```

---

### 4. Run the app

```bash
npm run dev
```

App will be live at:

```text
http://localhost:3000
```

---

## ⚠️ Notes

* Uses async polling for generation
* Handles API unpredictability with fallback logic
* Ensures stable demo experience (no crashes)

---

## 🎯 Why This Matters

ClipTune changes the workflow from:

```text
Search → Try → Fail → Repeat ❌
```

to:

```text
Upload → Generate → Refine → Done ✅
```

---

## 🏆 Vision

We believe future creative tools will be:

* AI-native
* iterative
* conversational

ClipTune is a step toward **AI-assisted storytelling**.

---

## 🙌 Built For

Hackathon submission — focused on:

* real usability
* polished UX
* demo impact

---

## 📌 Future Improvements

* 🎚️ Fine-grained controls (tempo, energy sliders)
* 🎼 Timeline sync with video cuts
* 📦 Export video with soundtrack
* 🎧 Multi-track layering

---

## ❤️ Final Thought

“This isn’t just generating music —
it’s directing emotion.”
