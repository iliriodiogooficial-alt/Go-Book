import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  FileText, 
  Image as ImageIcon, 
  Podcast, 
  Download, 
  Sparkles, 
  Play, 
  Pause, 
  Loader2, 
  UploadCloud, 
  Volume2, 
  VolumeX,
  Clock, 
  CheckSquare, 
  Trash2, 
  HelpCircle,
  X,
  ChevronRight,
  BookOpenCheck,
  RefreshCw
} from "lucide-react";
import Markdown from "react-markdown";
import { generateStudyPDF } from "./utils/pdfGenerator";
import { StudySession, PodcastLine, FileData } from "./types";

export default function App() {
  // Application states
  const [history, setHistory] = useState<StudySession[]>([]);
  const [activeSession, setActiveSession] = useState<StudySession | null>(null);
  
  // Creation form states
  const [topicText, setTopicText] = useState("");
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [podcastStyle, setPodcastStyle] = useState<'fun' | 'academic' | 'interview'>("fun");
  const [dragActive, setDragActive] = useState(false);

  // Status flags
  const [isGeneratingMaterial, setIsGeneratingMaterial] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [generationProgress, setGenerationProgress] = useState("");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Active view tab in main card
  const [activeTab, setActiveTab] = useState<'guide' | 'podcast'>("guide");

  // Audio Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioIntervalRef = useRef<any>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem("gobook_history");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setHistory(parsed);
        if (parsed.length > 0) {
          setActiveSession(parsed[0]);
        }
      } catch (e) {
        console.error("Erro ao carregar histórico do localStorage", e);
      }
    }
  }, []);

  // Save history to localstorage
  const saveHistory = (newHistory: StudySession[]) => {
    setHistory(newHistory);
    localStorage.setItem("gobook_history", JSON.stringify(newHistory));
  };

  // Handle drag events for file upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Convert uploaded file to base64
  const processFile = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      alert("Oops! O arquivo é muito grande. Escolha um arquivo de até 15MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1];
      setSelectedFile({
        base64: base64Data,
        name: file.name,
        mimeType: file.type || "application/octet-stream"
      });
    };
    reader.onerror = () => {
      alert("Erro ao ler o arquivo selecionado.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
  };

  // Submit study generation
  const handleGenerateStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicText.trim() && !selectedFile) {
      setErrorText("Por favor, digite um assunto ou envie um arquivo para analisarmos.");
      return;
    }

    setIsGeneratingMaterial(true);
    setErrorText(null);
    setAudioError(null);
    setGenerationProgress("Analisando o tema e gerando o Guia de Estudos exclusivo...");

    try {
      const response = await fetch("/api/study/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicText,
          fileBase64: selectedFile?.base64 || null,
          fileMimeType: selectedFile?.mimeType || null,
          podcastStyle
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Ocorreu um erro ao processar o seu material.");
      }

      const sessionData = await response.json();
      
      const newSession: StudySession = {
        id: Date.now().toString(),
        title: sessionData.title || "Guia de Estudos sem título",
        topic: topicText || selectedFile?.name || "Assunto desconhecido",
        summary: sessionData.summary || "",
        contentMarkdown: sessionData.contentMarkdown || "",
        podcastScript: sessionData.podcastScript || [],
        podcastStyle,
        createdAt: new Date().toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        })
      };

      // Set active session & save in history
      const updatedHistory = [newSession, ...history];
      saveHistory(updatedHistory);
      setActiveSession(newSession);
      setActiveTab("guide");

      // Reset form fields
      setTopicText("");
      setSelectedFile(null);

      // Now automatically trigger back-end Audio Generation
      triggerPodcastAudio(newSession);

    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Tivemos um problema com a IA. Por favor, tente novamente.");
    } finally {
      setIsGeneratingMaterial(false);
    }
  };

  // Trigger Gemini TTS Voice Generation for active podcast script
  const triggerPodcastAudio = async (session: StudySession) => {
    setIsGeneratingAudio(true);
    setAudioError(null);
    setGenerationProgress("Iniciando a narração inteligente... Lucas e Mariana estão gravando o debate!");

    // Stop current audio if playing
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    try {
      const response = await fetch("/api/study/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          podcastScript: session.podcastScript
        })
      });

      if (!response.ok) {
        throw new Error("Não foi possível gerar as vozes do Podcast.");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Update current active session with cached dynamic URL
      const updatedSession = { ...session, podcastAudioUrl: audioUrl };
      setActiveSession(updatedSession);

      // Also adjust in history (without the local URL cache since blobs expire on refresh, but is good for reactive state)
      const updatedHistory = history.map(h => h.id === session.id ? { ...h, podcastAudioUrl: audioUrl } : h);
      setHistory(updatedHistory);

    } catch (err: any) {
      console.error("Podcast audio generation failed", err);
      setAudioError("As vozes falharam por problema de conexão. Você ainda pode ler o roteiro debate abaixo!");
    } finally {
      setIsGeneratingAudio(false);
      setGenerationProgress("");
    }
  };

  // Handle loading audio explicitly
  const handleReloadAudio = () => {
    if (activeSession) {
      triggerPodcastAudio(activeSession);
    }
  };

  // Load selected history item
  const handleSelectSession = (session: StudySession) => {
    // If we have music playing, stop it
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setActiveSession(session);
    setActiveTab("guide");
    setAudioError(null);
  };

  // Delete session from history
  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    saveHistory(updated);
    if (activeSession?.id === id) {
      setActiveSession(updated.length > 0 ? updated[0] : null);
    }
  };

  // PDF Export
  const handleDownloadPDF = () => {
    if (!activeSession) return;
    generateStudyPDF(
      activeSession.title,
      activeSession.summary,
      activeSession.contentMarkdown
    );
  };

  // Browser HTML5 Audio control hooks
  useEffect(() => {
    if (activeSession?.podcastAudioUrl) {
      if (audioRef.current) {
        audioRef.current.src = activeSession.podcastAudioUrl;
        audioRef.current.load();
        setIsPlaying(false);
        setCurrentTime(0);
      }
    }
  }, [activeSession?.podcastAudioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      clearInterval(audioIntervalRef.current);
    } else {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          // Set tracking interval
          audioIntervalRef.current = setInterval(() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              setDuration(audioRef.current.duration || 0);
            }
          }, 250);
        })
        .catch(err => {
          console.error("Audio playback error", err);
          alert("Não foi possível iniciar o áudio. Tente novamente.");
        });
    }
  };

  // Cleanup effect
  useEffect(() => {
    return () => clearInterval(audioIntervalRef.current);
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setAudioVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
    }
    setIsMuted(vol === 0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRef.current.muted = nextMuted;
    if (nextMuted) {
      setAudioVolume(0);
    } else {
      setAudioVolume(1);
      audioRef.current.volume = 1;
    }
  };

  // Format second sizes into MM:SS format
  const formatTime = (secs: number) => {
    if (isNaN(secs)) return "00:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-indigo-50/50 text-indigo-950 font-sans" id="app-root">
      {/* Invisible HTML5 Audio source */}
      <audio 
        ref={audioRef} 
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          clearInterval(audioIntervalRef.current);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0);
          }
        }}
      />

      {/* Top Header navbar with Swiss Modern Branding */}
      <header className="border-b border-indigo-100 bg-white/80 backdrop-blur-md sticky top-0 z-40 transition-shadow hover:shadow-sm" id="main-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3" id="logo-container">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-150 flex items-center justify-center shrink-0">
              <BookOpenCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-indigo-900 tracking-tight italic leading-none">
                Go <span className="text-indigo-600 font-black italic">book</span>
              </h1>
              <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider mt-0.5">Seu tutor de bolso inteligente</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs bg-indigo-100 text-indigo-700 border border-indigo-200/65 px-3 py-1.5 rounded-full font-mono">
            <span className="w-2 h-2 bg-pink-500 rounded-full animate-ping"></span>
            <span>Gemini 3.5 & Multivoices ativo</span>
          </div>
        </div>
      </header>

      {/* Core Body Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Form & Config (Grid span 5) */}
          <section className="lg:col-span-5 space-y-6" id="creation-section">
            <div className="bg-white rounded-3xl border border-indigo-100 p-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <Sparkles className="w-36 h-36 text-indigo-600" />
              </div>

              <div className="flex items-center space-x-2 mb-4">
                <Sparkles className="w-5 h-5 text-indigo-600 animate-pulse" />
                <h2 className="text-lg font-bold text-indigo-900">O que vamos aprender hoje?</h2>
              </div>

              <form onSubmit={handleGenerateStudy} className="space-y-5">
                
                {/* Text prompt */}
                <div className="space-y-2">
                  <label htmlFor="topic-text" className="block text-sm font-bold text-indigo-900">
                    Escreva o assunto ou dúvidas:
                  </label>
                  <textarea
                    id="topic-text"
                    value={topicText}
                    onChange={(e) => setTopicText(e.target.value)}
                    placeholder="Ex: Como funciona a fotossíntese nas plantas de forma fácil, ou cole um trecho de assunto longo..."
                    rows={4}
                    className="w-full text-sm rounded-2xl border border-indigo-150 bg-slate-50/50 p-4 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all placeholder:text-slate-400"
                  />
                </div>

                {/* File Upload Zone */}
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-indigo-900">
                    Ou faça upload de uma foto da lousa, livro ou PDF (Opcional):
                  </label>

                  {!selectedFile ? (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                        dragActive 
                          ? "border-pink-500 bg-pink-50/30" 
                          : "border-indigo-200 bg-indigo-50/20 hover:bg-indigo-50/50 hover:border-indigo-300"
                      }`}
                      onClick={() => document.getElementById("file-loader")?.click()}
                      id="drop-zone"
                    >
                      <input
                        type="file"
                        id="file-loader"
                        className="hidden"
                        accept="image/*,application/pdf,text/plain"
                        onChange={handleFileChange}
                      />
                      <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-indigo-900">
                        Arraste seu arquivo aqui ou toque para navegar
                      </p>
                      <p className="text-xs text-indigo-400 mt-1">
                        Suporta PDFs, Imagens (de lousa, caderno) ou texto de até 15MB.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-2xl bg-indigo-50/80 border border-indigo-100 p-4" id="uploaded-file-banner">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="bg-indigo-600 text-white p-2.5 rounded-xl flex items-center justify-center shrink-0">
                          {selectedFile.mimeType.includes("image") ? (
                            <ImageIcon className="w-5 h-5" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-bold text-indigo-950 truncate select-all">{selectedFile.name}</p>
                          <p className="text-xs text-indigo-600 font-medium">Arquivo anexado ao estudo</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={removeSelectedFile}
                        className="p-1.5 hover:bg-indigo-150 rounded-lg text-indigo-500 hover:text-indigo-700 transition-colors"
                        title="Remover arquivo"
                        id="btn-remove-file"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Podcast tone style selector */}
                <div className="space-y-2">
                  <span className="block text-sm font-bold text-indigo-900">
                    Estilo do debate do Podcast:
                  </span>
                  <div className="grid grid-cols-3 gap-2" id="podcast-style-selector">
                    <button
                      type="button"
                      onClick={() => setPodcastStyle("fun")}
                      className={`py-3 px-3 text-xs font-black rounded-xl transition-all border ${
                        podcastStyle === "fun"
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                          : "bg-slate-50/50 border-indigo-100 text-indigo-750 hover:bg-indigo-50"
                      }`}
                    >
                      💡 Divertido
                    </button>
                    <button
                      type="button"
                      onClick={() => setPodcastStyle("academic")}
                      className={`py-3 px-3 text-xs font-black rounded-xl transition-all border ${
                        podcastStyle === "academic"
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                          : "bg-slate-50/50 border-indigo-100 text-indigo-750 hover:bg-indigo-50"
                      }`}
                    >
                      🎓 Didático
                    </button>
                    <button
                      type="button"
                      onClick={() => setPodcastStyle("interview")}
                      className={`py-3 px-3 text-xs font-black rounded-xl transition-all border ${
                        podcastStyle === "interview"
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                          : "bg-slate-50/50 border-indigo-100 text-indigo-750 hover:bg-indigo-50"
                      }`}
                    >
                      🎙️ Entrevista
                    </button>
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isGeneratingMaterial}
                  className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-4 px-4 rounded-2xl flex items-center justify-center space-x-2 transition-all shadow-lg shadow-pink-200/50 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                  id="btn-submit-generate"
                >
                  {isGeneratingMaterial ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Analisando e Criando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Gerar Kit de Estudo ✨</span>
                    </>
                  )}
                </button>
              </form>

              {/* Status information panel for generation */}
              {isGeneratingMaterial && (
                <div className="mt-4 p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-start space-x-3" id="loading-material-banner">
                  <div className="mt-0.5 shrink-0">
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-900">Preparando material de estudo...</h4>
                    <p className="text-xs text-indigo-600/90 mt-0.5">{generationProgress}</p>
                  </div>
                </div>
              )}

              {errorText && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-semibold flex items-center space-x-2" id="error-banner">
                  <X className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{errorText}</span>
                </div>
              )}
            </div>

            {/* Session History Sidebar Component */}
            <div className="bg-white rounded-3xl border border-indigo-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  <h3 className="text-sm font-bold text-indigo-900">Seus Estudos Recentes</h3>
                </div>
                <span className="text-xs text-indigo-400 font-semibold">{history.length} salvos</span>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-8 px-4 border border-dashed border-indigo-200 rounded-2xl bg-indigo-50/10" id="empty-history-placeholder">
                  <BookOpen className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
                  <p className="text-xs text-indigo-400 font-medium">Sua estante de estudos está vazia por enquanto.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1" id="history-container">
                  {history.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => handleSelectSession(session)}
                      className={`p-3 rounded-xl border transition-all text-left cursor-pointer flex items-center justify-between group ${
                        activeSession?.id === session.id
                          ? "bg-indigo-50 border-indigo-200 shadow-sm"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200"
                      }`}
                    >
                      <div className="overflow-hidden mr-2">
                        <h4 className={`text-xs font-bold truncate ${
                          activeSession?.id === session.id ? "text-indigo-800" : "text-slate-800"
                        }`}>
                          {session.title}
                        </h4>
                        <p className="text-[10px] text-indigo-400 font-medium flex items-center space-x-1 mt-0.5">
                          <span>{session.createdAt}</span>
                          <span>•</span>
                          <span className="capitalize">{session.podcastStyle === 'fun' ? 'divertido' : session.podcastStyle === 'academic' ? 'didático' : 'entrevista'}</span>
                        </p>
                      </div>
                      <div className="flex items-center shrink-0">
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="p-1 hover:bg-rose-100 hover:text-rose-600 rounded text-slate-400 transition-colors opacity-0 group-hover:opacity-100 mr-1"
                          title="Excluir estudo"
                          id={`delete-btn-${session.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className={`w-4 h-4 ${
                          activeSession?.id === session.id ? "text-indigo-500" : "text-slate-300"
                        }`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Right Column: PDF Guide Viewer & Podcast Audiobook Panel (Grid span 7) */}
          <section className="lg:col-span-7" id="display-section">
            <AnimatePresence mode="wait">
              {activeSession ? (
                <motion.div
                  key={activeSession.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  {/* Central Navigation Tabs for Active Study Material */}
                  <div className="bg-white rounded-3xl border border-indigo-100 p-2 shadow-sm flex space-x-2" id="tabs-navigation">
                    <button
                      onClick={() => setActiveTab("guide")}
                      className={`flex-1 py-3 px-4 rounded-2xl text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                        activeTab === "guide"
                          ? "bg-indigo-900 text-white shadow-sm"
                          : "text-indigo-800 hover:bg-indigo-50/50"
                      }`}
                      id="tab-guide-btn"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Guia de Estudos PDF</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("podcast")}
                      className={`flex-1 py-3 px-4 rounded-2xl text-sm font-bold flex items-center justify-center space-x-2 transition-all ${
                        activeTab === "podcast"
                          ? "bg-indigo-900 text-white shadow-sm"
                          : "text-indigo-800 hover:bg-indigo-50/50"
                      }`}
                      id="tab-podcast-btn"
                    >
                      <Podcast className="w-4 h-4" />
                      <span>Podcast em Áudio</span>
                      {isGeneratingAudio && (
                        <span className="w-2 h-2 bg-pink-500 rounded-full animate-ping"></span>
                      )}
                    </button>
                  </div>

                  {/* Active content block context */}
                  {activeTab === "guide" ? (
                    <div className="bg-white rounded-3xl border border-indigo-100 p-8 shadow-sm space-y-6 relative" id="guide-viewer">
                      {/* Control panel header inside Guide */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-indigo-50 gap-4">
                        <div>
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                            Guia de Leitura Prática
                          </span>
                          <h2 className="text-xl font-bold text-indigo-900 mt-1">{activeSession.title}</h2>
                        </div>
                        <button
                          onClick={handleDownloadPDF}
                          className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm shadow-pink-100 transition-colors self-start sm:self-auto"
                          id="btn-download-pdf"
                        >
                          <Download className="w-4 h-4" />
                          <span>Baixar PDF</span>
                        </button>
                      </div>

                      {/* PDF Preview container */}
                      <div className="prose prose-indigo max-w-none prose-sm leading-relaxed" id="markdown-canvas">
                        <div className="markdown-body text-indigo-950">
                          <Markdown>{activeSession.contentMarkdown}</Markdown>
                        </div>
                      </div>

                      {/* Simple custom footer banner inside book */}
                      <div className="bg-indigo-50/30 rounded-2xl p-4 flex items-center space-x-3 border border-indigo-100/50">
                        <CheckSquare className="w-5 h-5 text-emerald-500 shrink-0" />
                        <span className="text-xs text-indigo-605/90 leading-tight">
                          Você concluiu esta leitura! Baixe o seu arquivo .PDF para reler onde quiser e use a aba "Podcast" acima para ouvir o debate falado.
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Tab Podcast Content with mock player, generation state & live dialogues */
                    <div className="bg-white rounded-3xl border border-indigo-100 p-8 shadow-sm space-y-8" id="podcast-viewer">
                      <div className="text-center">
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Podcast Narrado por IA
                        </span>
                        <h2 className="text-xl font-bold text-indigo-900 mt-1">Debate Inteligente: {activeSession.title}</h2>
                        <p className="text-xs text-indigo-400 mt-1">Conheça o Lucas e a Mariana debatendo o tema selecionado em tempo real.</p>
                      </div>

                      {/* Retro Podcast Player Box Layout */}
                      <div className="bg-indigo-900 rounded-3xl p-6 text-white relative overflow-hidden shadow-inner flex flex-col md:flex-row items-center gap-6" id="audio-player-card">
                        
                        {/* Audio Album visual layout */}
                        <div className="w-32 h-32 bg-gradient-to-tr from-indigo-600 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shrink-0 relative group">
                          <Podcast className="w-14 h-14 text-white/90" />
                          {isPlaying && (
                            <span className="absolute inset-0 bg-black/20 rounded-2xl flex items-center justify-center">
                              <span className="flex space-x-1 items-end h-6">
                                <span className="w-1 bg-white animate-[bounce_0.8s_infinite] h-4"></span>
                                <span className="w-1 bg-white animate-[bounce_0.8s_infinite_0.2s] h-6"></span>
                                <span className="w-1 bg-white animate-[bounce_0.8s_infinite_0.4s] h-3"></span>
                              </span>
                            </span>
                          )}
                        </div>

                        {/* Player details column */}
                        <div className="flex-1 w-full space-y-4">
                          <div>
                            <p className="text-xs text-indigo-300 font-mono tracking-wider font-bold">GO BOOK CAST • DEBATE DINÂMICO</p>
                            <h3 className="text-base font-bold text-white truncate mt-0.5">{activeSession.title}</h3>
                            <p className="text-xs text-indigo-200/80 italic mt-0.5">Vozes: Lucas (Entusiasta) & Mariana (Mentora)</p>
                          </div>

                          {/* Interactive player slider */}
                          {activeSession.podcastAudioUrl ? (
                            <div className="space-y-1">
                              <input
                                type="range"
                                min={0}
                                max={duration || 100}
                                value={currentTime}
                                onChange={handleSeek}
                                className="w-full h-1 bg-indigo-950 rounded-lg appearance-none cursor-pointer accent-emerald-450"
                              />
                              <div className="flex justify-between text-[10px] text-indigo-200 font-mono">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatTime(duration)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="h-1 bg-indigo-950 rounded-full w-full relative">
                              <div className="absolute top-0 left-0 bottom-0 bg-pink-500 animate-[pulse_1.5s_infinite] w-full rounded-full"></div>
                            </div>
                          )}

                          {/* Control row block */}
                          <div className="flex items-center justify-between pt-1 gap-2">
                            {/* Left Side: Playing Toggle & Download Button */}
                            {activeSession.podcastAudioUrl ? (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={togglePlay}
                                  className="bg-white hover:bg-pink-50 text-indigo-900 rounded-full p-3 flex items-center justify-center shadow transition-transform active:scale-95"
                                  title={isPlaying ? "Pausar" : "Ouvir Podcast"}
                                  id="player-play-btn"
                                >
                                  {isPlaying ? (
                                    <Pause className="w-5 h-5 fill-indigo-900 text-indigo-900" />
                                  ) : (
                                    <Play className="w-5 h-5 fill-indigo-900 text-indigo-900 ml-0.5" />
                                  )}
                                </button>
                                
                                <a
                                  href={activeSession.podcastAudioUrl}
                                  download={`${activeSession.title.toLowerCase().replace(/[^a-z0-9]/gi, "_")}_podcast.wav`}
                                  className="bg-white/10 hover:bg-pink-500 text-indigo-100 hover:text-white border border-white/20 rounded-full p-3 flex items-center justify-center shadow transition-all active:scale-95"
                                  title="Baixar Podcast (Áudio WAV)"
                                  id="player-download-btn"
                                >
                                  <Download className="w-5 h-5" />
                                </a>
                              </div>
                            ) : (
                              <button
                                onClick={handleReloadAudio}
                                disabled={isGeneratingAudio}
                                className="bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-bold py-2.5 px-3.5 flex items-center space-x-2 transition-colors disabled:opacity-50"
                                id="btn-request-audio"
                              >
                                {isGeneratingAudio ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Gravando Debate...</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-4 h-4" />
                                    <span>Gerar Áudio do Debate</span>
                                  </>
                                )}
                              </button>
                            )}

                            {/* Right Side: Volume HUD */}
                            {activeSession.podcastAudioUrl && (
                              <div className="flex items-center space-x-2 text-indigo-200">
                                <button onClick={toggleMute} className="hover:text-white" id="player-volume-toggle">
                                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                                </button>
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.1}
                                  value={isMuted ? 0 : audioVolume}
                                  onChange={handleVolumeChange}
                                  className="w-16 h-1 bg-indigo-700 rounded-lg appearance-none cursor-pointer accent-white"
                                />
                              </div>
                            )}
                          </div>
                      </div>
                    </div>

                    {/* Audio Status Notifications inside tab */}
                    {isGeneratingAudio && (
                      <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-start space-x-3" id="podcast-audio-loader">
                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin mt-0.5 shrink-0" />
                        <div>
                          <h4 className="text-xs font-bold text-indigo-900">Gravando vozes e gerando Podcast MP3...</h4>
                          <p className="text-[10px] text-indigo-600 mt-0.5">
                            Isso pode demorar de 15 a 20 segundos enquanto a voz neural inteligente do Gemini sintetiza o debate educativo do Lucas e Mariana.
                          </p>
                        </div>
                      </div>
                    )}

                    {audioError && (
                      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start space-x-3 text-amber-800 text-xs font-semibold" id="podcast-error-alert">
                        <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p>{audioError}</p>
                          <button 
                            onClick={handleReloadAudio} 
                            className="text-xs text-indigo-600 hover:underline font-bold"
                          >
                            Tentar gravar novamente
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dialogue script lines transcript view (Lucas vs Mariana) */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-indigo-900 border-b border-indigo-100 pb-2 flex items-center space-x-2">
                        <span>Transcrição do Debate</span>
                        <span className="text-xs font-normal text-indigo-400">({activeSession.podcastScript.length} falas)</span>
                      </h3>

                      <div className="space-y-3" id="debates-dialogues">
                        {activeSession.podcastScript.map((line, idx) => (
                          <div 
                            key={idx}
                            className={`flex flex-col p-4 rounded-2xl transition-colors border ${
                              line.speaker === "Mariana"
                                ? "bg-indigo-50/40 border-indigo-100 align-left"
                                : "bg-pink-50/20 border-pink-100/50"
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              {line.speaker === "Mariana" ? (
                                <span className="text-xs font-bold text-indigo-900 bg-indigo-100 px-3 py-0.5 rounded-full">
                                  👩‍🏫 Mariana (Tutora)
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-pink-700 bg-pink-100 px-3 py-0.5 rounded-full">
                                  👦 Lucas (Aluno)
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-slate-700 mt-2 italic leading-relaxed">
                              "{line.text}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  )}
                </motion.div>
              ) : (
                /* Purely elegant Empty State Card */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-3xl border border-indigo-100 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[500px]"
                  id="empty-state-canvas"
                >
                  <div className="bg-indigo-50 p-4 rounded-full text-indigo-600 mb-4 animate-[pulse_3s_infinite]">
                    <BookOpenCheck className="w-12 h-12 text-indigo-600" />
                  </div>
                  <h2 className="text-xl font-bold text-indigo-900 leading-tight">Pronto para aprender melhor com o Go book?</h2>
                  <p className="text-sm text-indigo-600/70 max-w-md mx-auto mt-2 leading-relaxed">
                    Escreva o assunto que te interessa na lateral ou faça upload de um arquivo. Nós criaremos um resumo didático em .PDF e um podcast falado para você aprender sem complicação.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mt-8" id="quick-starters">
                    <button
                      onClick={() => {
                        setTopicText("Teoria da Relatividade Geral de Einstein");
                        setPodcastStyle("fun");
                      }}
                      className="p-3 text-left border border-indigo-100 rounded-2xl hover:border-pink-300 hover:bg-indigo-50/20 transition-all group text-indigo-900"
                    >
                      <h4 className="text-xs font-bold group-hover:text-indigo-600 uppercase">Física 🌌</h4>
                      <p className="text-[10px] text-indigo-400 mt-1 truncate">Teoria da Relatividade Geral...</p>
                    </button>
                    <button
                      onClick={() => {
                        setTopicText("Processo de Mitose e Meiose celular");
                        setPodcastStyle("academic");
                      }}
                      className="p-3 text-left border border-indigo-100 rounded-2xl hover:border-pink-300 hover:bg-indigo-50/20 transition-all group text-indigo-900"
                    >
                      <h4 className="text-xs font-bold group-hover:text-indigo-600 uppercase">Biologia 🧬</h4>
                      <p className="text-[10px] text-indigo-400 mt-1 truncate">Mitose e Meiose celular...</p>
                    </button>
                    <button
                      onClick={() => {
                        setTopicText("Revolução Francesa de 1789");
                        setPodcastStyle("interview");
                      }}
                      className="p-3 text-left border border-indigo-100 rounded-2xl hover:border-pink-300 hover:bg-indigo-50/20 transition-all group text-indigo-900"
                    >
                      <h4 className="text-xs font-bold group-hover:text-indigo-600 uppercase">História 🇨🇵</h4>
                      <p className="text-[10px] text-indigo-400 mt-1 truncate">Revolução Francesa...</p>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

        </div>
      </main>

      {/* Styled Footnotes & Statistics corresponding to Vibrant Palette spec */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 flex flex-col md:flex-row justify-between items-center text-indigo-400 border-t border-indigo-100 pt-8 pb-12 gap-6" id="main-footer">
        <div className="flex gap-12 text-left">
          <div className="flex flex-col">
            <span className="text-xs uppercase font-bold tracking-tighter text-indigo-500/80">Documentos Gerados</span>
            <span className="text-indigo-900 text-2xl font-black">12.482</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase font-bold tracking-tighter text-indigo-500/80">Estudantes Online</span>
            <span className="text-indigo-900 text-2xl font-black">4.209</span>
          </div>
        </div>
        <div className="flex flex-col items-center md:items-end text-center md:text-right">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-600/70">Powered by</span>
            <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-black tracking-widest uppercase">Go book AI</span>
          </div>
          <p className="text-[10px] text-indigo-400/80 mt-1.5">
            Go Book © 2026 • Inteligência de voz Gemini & Aprendizado Acelerado.
          </p>
        </div>
      </footer>
    </div>
  );
}
