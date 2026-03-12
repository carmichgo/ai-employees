"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  Send,
  Loader2,
  Bot,
  User,
  Download,
  FileText,
  FileSpreadsheet,
  FileCode,
  File,
  Search,
  MessageCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Phone,
  PhoneOff,
  RotateCcw,
  Trash2,
  Paperclip,
  X,
  Image as ImageIcon,
  Square,
  ArrowLeft,
  RotateCw,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ──────────────────────────────────────

interface Employee {
  id: string;
  name: string;
  jobTitle: string;
  emoji: string | null;
  status: string;
  dropletId: string | null;
  dropletIp: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  mode?: string;
}

interface ConversationPreview {
  employee: Employee;
  lastMessage: string | null;
  lastMessageTime: Date | null;
  lastAssistantTime: Date | null; // for unread tracking
}

// Shared localStorage key with dashboard layout
const LAST_SEEN_KEY = "inbox_last_seen";

function getLastSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function markSeen(employeeId: string) {
  const prev = getLastSeen();
  prev[employeeId] = new Date().toISOString();
  localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(prev));
}

// ── Main Inbox Page ─────────────────────────────

export default function InboxPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid #e5e5e5", borderTopColor: "#a3a3a3", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <InboxContent />
    </Suspense>
  );
}

function InboxContent() {
  const searchParams = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [previews, setPreviews] = useState<Map<string, ConversationPreview>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Chat state for the selected employee
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track which employee a send is for, so we discard stale responses
  const sendingForRef = useRef<string | null>(null);
  // Ref-based guard to prevent double-invocation of handleSend
  // (React state `sending` can be stale in closures between renders)
  const sendingGuardRef = useRef(false);

  // File upload state
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    setNotifPermission(Notification.permission);
    if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => setNotifPermission(perm));
    }
  }, []);

  // Show browser notification when a message arrives and tab is not focused
  const showNotification = useCallback((employeeName: string, messagePreview: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.hasFocus()) return;

    try {
      const notif = new Notification(`${employeeName}`, {
        body: messagePreview.slice(0, 200),
        icon: "/favicon.ico",
        tag: `ai-employee-${employeeName}`,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      // Auto-close after 10 seconds
      setTimeout(() => notif.close(), 10000);
    } catch {
      // Notification API can throw in some contexts (e.g. insecure origins)
    }
  }, []);

  // Voice state (dictation)
  const [listening, setListening] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

  // Voice call state
  const [inCall, setInCall] = useState(false);
  const [callPhase, setCallPhase] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [callTranscript, setCallTranscript] = useState("");
  const callRecognitionRef = useRef<any>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callActiveRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAvailableRef = useRef<boolean | null>(null);

  useEffect(() => {
    setHasSpeechSupport(
      typeof window !== "undefined" &&
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
    );
  }, []);

  // Load employees and their last messages
  useEffect(() => {
    async function load() {
      try {
        const res = await api.listEmployees();
        const emps = (res.employees || []).filter(
          (e: Employee) => e.status !== "terminated",
        );
        setEmployees(emps);

        // Load last message for each employee
        const previewMap = new Map<string, ConversationPreview>();
        await Promise.all(
          emps.map(async (emp: Employee) => {
            try {
              const historyRes = await api.getChatHistory(emp.id);
              const msgs = historyRes.messages || [];
              const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
              const lastAssistant = [...msgs].reverse().find((m: any) => m.role === "assistant");
              previewMap.set(emp.id, {
                employee: emp,
                lastMessage: last?.content?.slice(0, 80) || null,
                lastMessageTime: last ? new Date(last.createdAt) : null,
                lastAssistantTime: lastAssistant ? new Date(lastAssistant.createdAt) : null,
              });
            } catch {
              previewMap.set(emp.id, {
                employee: emp,
                lastMessage: null,
                lastMessageTime: null,
                lastAssistantTime: null,
              });
            }
          }),
        );
        setPreviews(previewMap);

        // Auto-select employee from ?employee= query param, or first employee
        if (emps.length > 0 && !selectedId) {
          const paramId = searchParams.get("employee");
          const target = paramId && emps.find((e: Employee) => e.id === paramId)
            ? paramId
            : emps[0].id;
          setSelectedId(target);
        }
      } catch {
        // Failed to load
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load chat when selected employee changes
  const loadChat = useCallback(
    async (empId: string) => {
      setChatLoading(true);
      setMessages([]);
      setPendingReplyId(null);
      try {
        const historyRes = await api.getChatHistory(empId);
        if (historyRes.messages.length > 0) {
          const mapped = historyRes.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.createdAt),
            mode: m.mode || undefined,
          }));
          setMessages(mapped);

          // Detect if the AI is still working (page was refreshed mid-response).
          // If the last message is from the user and was sent recently (<5 min ago),
          // or the last assistant message has mode "pending", resume the waiting state.
          const last = mapped[mapped.length - 1];
          const FIVE_MINUTES = 5 * 60 * 1000;
          const isRecent = Date.now() - last.timestamp.getTime() < FIVE_MINUTES;

          if (last.role === "user" && isRecent) {
            // No reply yet — show a pending indicator and start polling
            const pendingId = `pending-resume-${Date.now()}`;
            setMessages((prev) => [
              ...prev,
              {
                id: pendingId,
                role: "assistant",
                content: "Still working on this — the response will appear here when it's ready.",
                timestamp: new Date(),
                mode: "pending",
              },
            ]);
            setPendingReplyId(pendingId);
          } else if (last.role === "assistant" && last.mode === "pending" && isRecent) {
            // Existing pending message — resume polling for the real reply
            setPendingReplyId(last.id);
          }
        } else {
          const emp = employees.find((e) => e.id === empId);
          if (emp) {
            setMessages([
              {
                id: "welcome",
                role: "assistant",
                content: `Hi! I'm ${emp.name}, your ${emp.jobTitle}. How can I help you today?`,
                timestamp: new Date(),
              },
            ]);
          }
        }
      } catch {
        const emp = employees.find((e) => e.id === empId);
        if (emp) {
          setMessages([
            {
              id: "welcome",
              role: "assistant",
              content: `Hi! I'm ${emp.name}, your ${emp.jobTitle}. How can I help you today?`,
              timestamp: new Date(),
            },
          ]);
        }
      } finally {
        setChatLoading(false);
      }
    },
    [employees],
  );

  useEffect(() => {
    if (selectedId) {
      loadChat(selectedId);
      setInput("");
      setPendingFiles([]);
      // Cancel any in-flight send for the previous employee
      setSending(false);
      sendingForRef.current = null;
      sendingGuardRef.current = false;
      setPendingReplyId(null);
    }
  }, [selectedId, loadChat]);

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ── Voice: Speech Recognition (STT) ──
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((r: any) => r[0].transcript).join("");
      setInput(transcript);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + "px";
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // ── TTS: API-backed speech with browser fallback ──
  const getBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    const prefs = [
      /Google US English/i, /Google UK English Female/i,
      /Microsoft.*Neural/i, /Samantha/i, /Karen/i, /Daniel/i,
      /en.*Female/i, /en.*Male/i, /en-US/i, /en-GB/i, /en/i,
    ];
    for (const pref of prefs) {
      const v = voices.find((v) => pref.test(v.name) || pref.test(v.lang));
      if (v) return v;
    }
    return voices[0] || null;
  }, []);

  // Fetch TTS audio for a single chunk of text (returns blob URL or null)
  const fetchTtsAudio = useCallback(async (text: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    if (ttsAvailableRef.current === false) return null;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text }),
      });
      if (res.ok && res.headers.get("content-type")?.startsWith("audio/")) {
        ttsAvailableRef.current = true;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
      const body = await res.json().catch(() => ({}));
      if (body.fallback) ttsAvailableRef.current = false;
    } catch { /* fall through */ }
    return null;
  }, []);

  // Play a blob URL as audio, returns a promise that resolves when done
  const playAudioUrl = useCallback((url: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; resolve(); };
      audio.play().catch(() => resolve());
    });
  }, []);

  // Split text into speakable sentences for pipelined TTS
  const splitSentences = useCallback((text: string): string[] => {
    const clean = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " image ")
      .replace(/\[[^\]]*\]\([^)]+\)/g, (m) => m.replace(/\[([^\]]*)\]\([^)]+\)/, "$1"))
      .replace(/[#*_~>]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();
    if (!clean) return [];
    // Split on sentence boundaries (., !, ?) followed by space or end
    const parts = clean.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) || [clean];
    return parts.map((s) => s.trim()).filter(Boolean);
  }, []);

  // Speak with sentence-level pipelining: start playing the first sentence
  // while fetching TTS for subsequent sentences in parallel
  const speakAsync = useCallback(async (text: string): Promise<void> => {
    if (typeof window === "undefined") return;

    const sentences = splitSentences(text);
    if (sentences.length === 0) return;

    // If API TTS is available, pipeline sentences
    if (ttsAvailableRef.current !== false) {
      // Start fetching TTS for the first sentence immediately
      let nextFetch: Promise<string | null> = fetchTtsAudio(sentences[0]);

      for (let i = 0; i < sentences.length; i++) {
        if (!callActiveRef.current && i > 0) break; // call ended
        const audioUrl = await nextFetch;
        // Start fetching next sentence while current one plays
        if (i + 1 < sentences.length) {
          nextFetch = fetchTtsAudio(sentences[i + 1]);
        }
        if (audioUrl) {
          await playAudioUrl(audioUrl);
        }
      }
      if ((ttsAvailableRef.current as boolean | null) !== false) return;
    }

    // Fallback: browser SpeechSynthesis
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = sentences.join(" ");
    if (!clean) return;
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(clean);
      const voice = getBestVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, [getBestVoice, splitSentences, fetchTtsAudio, playAudioUrl]);

  const speak = useCallback((text: string) => { speakAsync(text); }, [speakAsync]);

  // ── Voice Call: send message and speak response ──
  const callSendAndRespond = useCallback(async (text: string) => {
    if (!text.trim() || !callActiveRef.current || !selectedId) return;
    setCallPhase("processing");
    const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content: text.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const history = messages.filter((m) => m.id !== "welcome").map((m) => ({ role: m.role, content: m.content }));
      // Prefix with [Voice call] so the AI knows to keep responses brief and conversational
      const voiceText = `[Voice call — respond in 1-2 short sentences, conversational tone] ${text.trim()}`;
      history.push({ role: "user", content: voiceText });
      const res = await api.chatWithEmployee(selectedId, voiceText, history.slice(0, -1));
      const assistantMessage: Message = { id: `assistant-${Date.now()}`, role: "assistant", content: res.reply, timestamp: new Date(), mode: res.mode };
      setMessages((prev) => [...prev, assistantMessage]);
      if (!callActiveRef.current) return;
      setCallPhase("speaking");
      try { await speakAsync(res.reply); } catch { /* handled internally */ }
      if (callActiveRef.current) callStartListening();
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: "assistant", content: `Sorry, I couldn't process that: ${err.message}`, timestamp: new Date() }]);
      if (callActiveRef.current) callStartListening();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, messages]);

  // ── Voice Call: start continuous listening ──
  const callStartListening = useCallback(() => {
    if (!callActiveRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    callRecognitionRef.current?.abort();
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setCallTranscript(finalTranscript + interim);
    };
    recognition.onend = () => {
      if (!callActiveRef.current) return;
      if (finalTranscript.trim()) { setCallTranscript(""); callSendAndRespond(finalTranscript); }
      else if (callActiveRef.current) setTimeout(() => callStartListening(), 300);
    };
    recognition.onerror = (e: any) => {
      if (e.error === "no-speech" && callActiveRef.current) { setTimeout(() => callStartListening(), 300); return; }
      if (e.error === "aborted") return;
      if (callActiveRef.current) setTimeout(() => callStartListening(), 1000);
    };
    callRecognitionRef.current = recognition;
    setCallPhase("listening");
    setCallTranscript("");
    recognition.start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSendAndRespond]);

  // ── Voice Call: start/end call ──
  const startCall = useCallback(() => {
    callActiveRef.current = true;
    setInCall(true);
    setCallDuration(0);
    setCallPhase("listening");
    setCallTranscript("");
    callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    callStartListening();
  }, [callStartListening]);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    setInCall(false);
    setCallPhase("idle");
    setCallTranscript("");
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    callRecognitionRef.current?.abort();
    callRecognitionRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  // Cleanup call on unmount
  useEffect(() => {
    return () => {
      callActiveRef.current = false;
      callRecognitionRef.current?.abort();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Poll for the real reply when a response is still pending (container
  // is working but the HTTP request timed out). The API saves the reply
  // to chat_messages when the container finishes, so we poll until it
  // appears and then swap out the temporary "still working" message.
  const [pendingReplyId, setPendingReplyId] = useState<string | null>(null);
  const pendingPollCount = useRef(0);

  useEffect(() => {
    if (!pendingReplyId || !selectedId) return;
    pendingPollCount.current = 0;

    const interval = setInterval(async () => {
      pendingPollCount.current++;
      // Give up after ~5 minutes of polling (60 attempts * 5s)
      if (pendingPollCount.current > 60) {
        setPendingReplyId(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === pendingReplyId
              ? { ...m, content: "The response took too long. Please try sending your message again.", mode: "system" }
              : m,
          ),
        );
        return;
      }

      try {
        const historyRes = await api.getChatHistory(selectedId);
        const msgs = historyRes.messages; // oldest-first

        // Find the last user message — this is the one that triggered the pending state.
        // Then look for an assistant reply that came AFTER it. This avoids falsely
        // matching an old assistant message from a previous conversation turn.
        let lastUserIdx = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "user") { lastUserIdx = i; break; }
        }
        const replyAfterUser = lastUserIdx >= 0
          ? msgs.slice(lastUserIdx + 1).find((m: any) => m.role === "assistant")
          : null;

        if (replyAfterUser) {
          // The real reply arrived — replace the temporary message
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingReplyId
                ? { ...m, id: replyAfterUser.id, content: replyAfterUser.content, mode: replyAfterUser.mode || undefined }
                : m,
            ),
          );
          setPendingReplyId(null);

          // Notify if tab is not focused
          const emp = employees.find((e) => e.id === selectedId);
          if (emp) showNotification(emp.name, replyAfterUser.content);
        }
      } catch {
        // Polling failed — keep trying
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pendingReplyId, selectedId]);

  // Handle files selected via file picker
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((f) => f.size <= 10 * 1024 * 1024);
    if (valid.length < files.length) alert("Some files were skipped (max 10MB per file)");
    setPendingFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Drag-and-drop file support
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const valid = files.filter((f) => f.size <= 10 * 1024 * 1024);
    if (valid.length < files.length) alert("Some files were skipped (max 10MB per file)");
    if (valid.length > 0) setPendingFiles((prev) => [...prev, ...valid]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

  // Stop employee — kill all running processes
  const handleStop = async () => {
    if (!selectedId) return;
    try {
      await api.stopEmployee(selectedId);
      setSending(false);
      sendingGuardRef.current = false;
      sendingForRef.current = null;
    } catch (err: any) {
      alert(`Stop failed: ${err.message}`);
    }
  };

  // Send message
  const handleSend = async () => {
    // Ref-based guard prevents double-invocation (state can be stale in closures)
    if (sendingGuardRef.current) return;
    const text = input.trim();
    const filesToUpload = [...pendingFiles];
    if ((!text && filesToUpload.length === 0) || sending || !selectedId) return;

    const emp = employees.find((e) => e.id === selectedId);
    if (!emp || emp.status !== "active") return;

    sendingGuardRef.current = true;

    // Build the user-visible message
    const fileNames = filesToUpload.map((f) => f.name);
    const displayText = text
      ? (fileNames.length > 0 ? `${text}\n\n${fileNames.map((n) => `[Attached: ${n}]`).join("\n")}` : text)
      : fileNames.map((n) => `[Attached: ${n}]`).join("\n");

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: displayText,
      timestamp: new Date(),
    };

    const sendForId = selectedId;
    sendingForRef.current = sendForId;

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setPendingFiles([]);
    setSending(true);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      // Upload files first
      const uploadedNames: string[] = [];
      for (const file of filesToUpload) {
        try {
          const result = await api.uploadFile(selectedId, file);
          uploadedNames.push(result.file?.name || file.name);
        } catch (err: any) {
          console.error(`Failed to upload ${file.name}:`, err);
          uploadedNames.push(`${file.name} (upload failed)`);
        }
      }

      // Update the displayed message with actual (sanitized) filenames from the upload
      // so the attachment chips use the correct download URL
      if (filesToUpload.length > 0) {
        const updatedTags = uploadedNames.map((n) =>
          n.includes("upload failed")
            ? `[Upload failed: ${n.replace(" (upload failed)", "")}]`
            : `[Attached: ${n}]`,
        );
        const updatedContent = text
          ? `${text}\n\n${updatedTags.join("\n")}`
          : updatedTags.join("\n");
        setMessages((prev) =>
          prev.map((m) => (m.id === userMessage.id ? { ...m, content: updatedContent } : m)),
        );
      }

      // Build file metadata for files that uploaded successfully
      const successFiles = uploadedNames
        .map((n, i) => ({
          name: n,
          mimeType: filesToUpload[i]?.type || "application/octet-stream",
          failed: n.includes("upload failed"),
        }))
        .filter((f) => !f.failed)
        .map(({ name, mimeType }) => ({ name, mimeType }));

      // Build the message to send to the employee
      const messageText = text || (successFiles.length > 0
        ? `Please review the attached file${successFiles.length > 1 ? "s" : ""}.`
        : "");

      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await api.chatWithEmployee(
        sendForId,
        messageText,
        history,
        successFiles.length > 0 ? successFiles : undefined,
      );

      // Discard response if user switched to a different employee
      if (sendingForRef.current !== sendForId) return;

      const msgId = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: msgId,
        role: "assistant",
        content: res.reply,
        timestamp: new Date(),
        mode: res.mode,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If the response is still pending (container working, HTTP timed out),
      // start polling for the real reply.
      if (res.mode === "pending") {
        setPendingReplyId(msgId);
      } else {
        // Notify if tab is not focused
        const emp = employees.find((e) => e.id === sendForId);
        if (emp) showNotification(emp.name, res.reply);
        if (autoSpeak) speak(res.reply);
      }

      // Update preview
      setPreviews((prev) => {
        const updated = new Map(prev);
        const existing = updated.get(sendForId);
        if (existing) {
          updated.set(sendForId, {
            ...existing,
            lastMessage: res.reply.slice(0, 80),
            lastMessageTime: new Date(),
          });
        }
        return updated;
      });
    } catch (err: any) {
      if (sendingForRef.current === sendForId) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: `Sorry, I couldn't process that: ${err.message}`,
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      if (sendingForRef.current === sendForId) {
        setSending(false);
      }
      sendingGuardRef.current = false;
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  };

  // Filter employees by search
  const filtered = employees.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.jobTitle.toLowerCase().includes(search.toLowerCase()),
  );

  // Sort: employees with recent messages first, then by name
  const sorted = [...filtered].sort((a, b) => {
    const aTime = previews.get(a.id)?.lastMessageTime?.getTime() || 0;
    const bTime = previews.get(b.id)?.lastMessageTime?.getTime() || 0;
    if (aTime && bTime) return bTime - aTime;
    if (aTime) return -1;
    if (bTime) return 1;
    return a.name.localeCompare(b.name);
  });

  const selectedEmployee = employees.find((e) => e.id === selectedId);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh" }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2px solid var(--border, #e5e5e5)",
            borderTopColor: "var(--text-tertiary, #a3a3a3)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div
      className="inbox-container"
      style={{
        display: "flex",
        height: "calc(100vh - 48px)",
        margin: "-24px -32px",
        width: "calc(100% + 64px)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .inbox-container {
            height: calc(100vh - 68px) !important;
            margin: -16px !important;
            width: calc(100% + 32px) !important;
          }
          .inbox-sidebar {
            display: ${selectedId ? "none" : "flex"} !important;
            width: 100% !important;
            min-width: 100% !important;
          }
          .inbox-chat {
            display: ${selectedId ? "flex" : "none"} !important;
          }
          .inbox-back-btn {
            display: flex !important;
          }
        }
        @media (min-width: 769px) {
          .inbox-back-btn {
            display: none !important;
          }
        }
      `}</style>
      {/* ── Employee Sidebar ── */}
      <div
        className="inbox-sidebar"
        style={{
          width: 300,
          minWidth: 300,
          borderRight: "1px solid var(--border, #e5e5e5)",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg, #ffffff)",
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: "1px solid var(--border, #e5e5e5)",
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text, #0a0a0a)", margin: 0, marginBottom: 12 }}>
            Inbox
          </h2>
          {notifPermission === "default" && (
            <button
              onClick={() => {
                Notification.requestPermission().then((perm) => setNotifPermission(perm));
              }}
              style={{
                width: "100%",
                padding: "6px 10px",
                marginBottom: 8,
                fontSize: 11,
                color: "var(--blue, #3b82f6)",
                background: "rgba(59, 130, 246, 0.06)",
                border: "1px solid rgba(59, 130, 246, 0.15)",
                borderRadius: "var(--radius-md, 8px)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Enable notifications to get alerts when employees reply
            </button>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--border, #e5e5e5)",
              background: "var(--bg-secondary, #f5f5f5)",
            }}
          >
            <Search size={14} style={{ color: "var(--text-tertiary, #a3a3a3)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                color: "var(--text, #0a0a0a)",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Employee list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {sorted.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary, #a3a3a3)", fontSize: 13 }}>
              {employees.length === 0 ? "No employees yet" : "No matches"}
            </div>
          )}
          {sorted.map((emp) => {
            const preview = previews.get(emp.id);
            const isSelected = emp.id === selectedId;
            const statusColor =
              emp.status === "active"
                ? "#22c55e"
                : emp.status === "provisioning"
                  ? "#f59e0b"
                  : "#a3a3a3";

            return (
              <button
                key={emp.id}
                onClick={() => { setSelectedId(emp.id); markSeen(emp.id); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: isSelected ? "var(--bg-secondary, #f5f5f5)" : "transparent",
                  border: "none",
                  borderLeft: isSelected ? "3px solid var(--text, #0a0a0a)" : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "var(--bg-secondary, #f5f5f5)",
                    border: "1px solid var(--border, #e5e5e5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  {emp.emoji || emp.name.charAt(0)}
                  {/* Status dot */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: -1,
                      right: -1,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: statusColor,
                      border: "2px solid var(--bg, #ffffff)",
                    }}
                  />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 500,
                      color: "var(--text, #0a0a0a)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {emp.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary, #a3a3a3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginTop: 2,
                    }}
                  >
                    {preview?.lastMessage || emp.jobTitle}
                  </div>
                </div>

                {/* Time + unread badge */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  {preview?.lastMessageTime && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary, #a3a3a3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTime(preview.lastMessageTime)}
                    </div>
                  )}
                  {(() => {
                    const lastSeen = getLastSeen();
                    const seenTs = lastSeen[emp.id];
                    const assistantTime = preview?.lastAssistantTime;
                    const hasUnread = assistantTime && (!seenTs || assistantTime > new Date(seenTs));
                    return hasUnread ? (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#ef4444",
                        }}
                      />
                    ) : null;
                  })()}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Chat Panel ── */}
      <div
        className="inbox-chat"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--bg, #ffffff)",
          minWidth: 0,
          position: "relative",
        }}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 50,
            background: "rgba(37, 99, 235, 0.06)", border: "2px dashed #2563eb",
            borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <div style={{
              padding: "16px 24px", borderRadius: 8,
              background: "var(--bg, #ffffff)", border: "1px solid rgba(37, 99, 235, 0.3)",
              fontSize: 14, fontWeight: 500, color: "#2563eb",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Paperclip size={16} /> Drop files to attach
            </div>
          </div>
        )}
        {!selectedEmployee ? (
          /* Empty state */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: "var(--text-tertiary, #a3a3a3)",
            }}
          >
            <MessageCircle size={48} strokeWidth={1} />
            <div style={{ fontSize: 16, fontWeight: 500 }}>Select a conversation</div>
            <div style={{ fontSize: 13 }}>Choose an employee from the sidebar to start chatting</div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 24px",
                borderBottom: "1px solid var(--border, #e5e5e5)",
                flexShrink: 0,
              }}
            >
              <button
                className="inbox-back-btn"
                onClick={() => setSelectedId(null)}
                style={{
                  display: "none",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  padding: 4,
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--bg-secondary, #f5f5f5)",
                  border: "1px solid var(--border, #e5e5e5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}
              >
                {selectedEmployee.emoji || selectedEmployee.name.charAt(0)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text, #0a0a0a)" }}>
                  {selectedEmployee.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary, #a3a3a3)" }}>
                  {selectedEmployee.jobTitle}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Voice call button */}
                {hasSpeechSupport && selectedEmployee.status === "active" && (
                  <button
                    onClick={startCall}
                    title="Start voice call"
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: "1px solid var(--border, #e5e5e5)",
                      background: "rgba(22, 163, 74, 0.08)", color: "#16a34a",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <Phone size={14} />
                  </button>
                )}
                {/* Restart container button */}
                {selectedEmployee.status === "active" && (
                  <button
                    onClick={async () => {
                      if (!confirm("Restart this employee's container? This clears stuck state and takes ~10 seconds.")) return;
                      try {
                        const res = await api.restartEmployee(selectedId!, true);
                        setMessages([{
                          id: "welcome",
                          role: "assistant",
                          content: `Container restarted. ${res.results?.join(". ") || "Ready to go."}`,
                          timestamp: new Date(),
                        }]);
                      } catch (err: any) {
                        alert(`Restart failed: ${err.message}`);
                      }
                    }}
                    title="Restart employee (clears stuck state)"
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: "1px solid var(--border, #e5e5e5)",
                      background: "rgba(245, 158, 11, 0.08)", color: "#d97706",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
                {/* Clear chat button */}
                <button
                  onClick={async () => {
                    if (!confirm("Clear chat history?")) return;
                    try {
                      await api.clearChatHistory(selectedId!);
                      const emp = employees.find((e) => e.id === selectedId);
                      setMessages([{
                        id: "welcome",
                        role: "assistant",
                        content: `Hi! I'm ${emp?.name || "your employee"}, your ${emp?.jobTitle || "assistant"}. How can I help you today?`,
                        timestamp: new Date(),
                      }]);
                    } catch (err: any) {
                      alert(`Failed to clear: ${err.message}`);
                    }
                  }}
                  title="Clear chat history"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: "1px solid var(--border, #e5e5e5)",
                    background: "var(--bg, #ffffff)", color: "var(--text-tertiary, #a3a3a3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <Trash2 size={14} />
                </button>
                {/* Auto-speak toggle */}
                <button
                  onClick={() => {
                    const next = !autoSpeak;
                    setAutoSpeak(next);
                    if (!next && typeof window !== "undefined") window.speechSynthesis?.cancel();
                  }}
                  title={autoSpeak ? "Mute voice responses" : "Read responses aloud"}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: "1px solid var(--border, #e5e5e5)",
                    background: autoSpeak ? "rgba(37, 99, 235, 0.08)" : "var(--bg, #ffffff)",
                    color: autoSpeak ? "#2563eb" : "var(--text-tertiary, #a3a3a3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 500,
                  background:
                    selectedEmployee.status === "active"
                      ? "rgba(34, 197, 94, 0.08)"
                      : selectedEmployee.status === "provisioning"
                        ? "rgba(245, 158, 11, 0.08)"
                        : "var(--bg-secondary, #f5f5f5)",
                  color:
                    selectedEmployee.status === "active"
                      ? "#16a34a"
                      : selectedEmployee.status === "provisioning"
                        ? "#d97706"
                        : "var(--text-tertiary, #a3a3a3)",
                  border: "1px solid",
                  borderColor:
                    selectedEmployee.status === "active"
                      ? "rgba(34, 197, 94, 0.2)"
                      : selectedEmployee.status === "provisioning"
                        ? "rgba(245, 158, 11, 0.2)"
                        : "var(--border, #e5e5e5)",
                  textTransform: "capitalize",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                  }}
                />
                {selectedEmployee.status}
              </div>
            </div>

            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "24px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              {chatLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: "2px solid var(--border, #e5e5e5)",
                      borderTopColor: "var(--text-tertiary, #a3a3a3)",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                        flexDirection: msg.role === "user" ? "row-reverse" : "row",
                        maxWidth: 800,
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--bg-secondary, #f5f5f5)",
                          border: "1px solid var(--border, #e5e5e5)",
                          fontSize: msg.role === "assistant" ? 16 : 14,
                        }}
                      >
                        {msg.role === "assistant" ? (
                          <span>{selectedEmployee.emoji || <Bot size={16} />}</span>
                        ) : (
                          <User size={14} style={{ color: "var(--text-secondary, #525252)" }} />
                        )}
                      </div>

                      {/* Bubble */}
                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "12px 16px",
                          borderRadius:
                            msg.role === "user"
                              ? "16px 16px 4px 16px"
                              : "16px 16px 16px 4px",
                          background:
                            msg.role === "user"
                              ? "rgba(37, 99, 235, 0.06)"
                              : "var(--bg-secondary, #f5f5f5)",
                          border: "1px solid var(--border, #e5e5e5)",
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: "var(--text, #0a0a0a)",
                          wordBreak: "break-word",
                        }}
                      >
                        <MessageContent content={msg.content} employeeId={selectedId!} />
                        {msg.mode === "demo" && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "rgba(245, 158, 11, 0.08)",
                              border: "1px solid rgba(245, 158, 11, 0.2)",
                              fontSize: 11,
                              color: "#b45309",
                            }}
                          >
                            Getting ready — this employee is still being set up
                          </div>
                        )}
                        {msg.mode === "pending" && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "4px 8px",
                              borderRadius: 4,
                              background: "rgba(37, 99, 235, 0.06)",
                              border: "1px solid rgba(37, 99, 235, 0.15)",
                              fontSize: 11,
                              color: "#2563eb",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Loader2 size={10} style={{ animation: "spin 1.5s linear infinite" }} />
                            Working on it — the response will appear automatically
                          </div>
                        )}
                        {msg.mode === "unreachable" && (
                          <div
                            style={{
                              marginTop: 10,
                              padding: "10px 12px",
                              borderRadius: 8,
                              background: "rgba(220, 38, 38, 0.04)",
                              border: "1px solid rgba(220, 38, 38, 0.15)",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#dc2626", fontWeight: 600, marginBottom: 8 }}>
                              <AlertTriangle size={13} /> Workspace unreachable
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                className="btn-primary btn-sm"
                                style={{ fontSize: 11, padding: "4px 10px", gap: 4 }}
                                onClick={async () => {
                                  try {
                                    await fetch(`/api/employees/${selectedId}/restart`, { method: "POST" });
                                    setMessages((prev) => [...prev, {
                                      id: `system-${Date.now()}`,
                                      role: "assistant",
                                      content: "Restarting workspace... try sending a message in ~30 seconds.",
                                      timestamp: new Date(),
                                      mode: "system",
                                    }]);
                                    // Refresh employee list to pick up status change
                                    const empRes = await api.listEmployees();
                                    setEmployees(empRes.employees.filter((e: Employee) => e.status !== "terminated"));
                                  } catch {}
                                }}
                              >
                                <RefreshCw size={11} /> Restart
                              </button>
                              <button
                                className="btn-secondary btn-sm"
                                style={{ fontSize: 11, padding: "4px 10px", gap: 4 }}
                                onClick={async () => {
                                  try {
                                    await fetch(`/api/employees/${selectedId}/reboot`, { method: "POST" });
                                    setMessages((prev) => [...prev, {
                                      id: `system-${Date.now()}`,
                                      role: "assistant",
                                      content: "Rebooting server... this takes 1-2 minutes. Try sending a message after that.",
                                      timestamp: new Date(),
                                      mode: "system",
                                    }]);
                                  } catch {}
                                }}
                              >
                                <RotateCw size={11} /> Reboot Server
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Typing indicator */}
                  {sending && (
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "var(--bg-secondary, #f5f5f5)",
                          border: "1px solid var(--border, #e5e5e5)",
                          fontSize: 16,
                        }}
                      >
                        {selectedEmployee.emoji || "A"}
                      </div>
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: "16px 16px 16px 4px",
                          background: "var(--bg-secondary, #f5f5f5)",
                          border: "1px solid var(--border, #e5e5e5)",
                          display: "flex",
                          gap: 4,
                          alignItems: "center",
                        }}
                      >
                        <span className="typing-dot" style={{ animationDelay: "0s" }} />
                        <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
                        <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
                      </div>
                      <button
                        onClick={handleStop}
                        title="Stop — kill all running processes"
                        style={{
                          padding: "8px 14px", borderRadius: 8, border: "1px solid #ef4444",
                          background: "rgba(239, 68, 68, 0.08)", color: "#ef4444",
                          cursor: "pointer", fontSize: 12, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 6, alignSelf: "center",
                        }}
                      >
                        <Square size={12} fill="#ef4444" /> Stop
                      </button>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div
              style={{
                flexShrink: 0,
                padding: "12px 24px 16px",
                borderTop: "1px solid var(--border, #e5e5e5)",
              }}
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: "none" }}
                accept="image/*,.pdf,.csv,.tsv,.txt,.md,.json,.yaml,.yml,.html,.xml,.docx,.xlsx,.pptx,.zip,.py,.js,.ts,.sh,.sql,.doc,.xls,.ppt"
              />
              {/* Pending file attachments */}
              {pendingFiles.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 0 8px" }}>
                  {pendingFiles.map((file, idx) => {
                    const isImage = file.type.startsWith("image/");
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "4px 8px 4px 10px", borderRadius: 6,
                          background: "rgba(37, 99, 235, 0.04)",
                          border: "1px solid rgba(37, 99, 235, 0.15)",
                          fontSize: 12, color: "var(--text-secondary, #525252)", maxWidth: 220,
                        }}
                      >
                        {isImage ? <ImageIcon size={13} style={{ color: "#2563eb", flexShrink: 0 }} /> : <FileText size={13} style={{ color: "#2563eb", flexShrink: 0 }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-tertiary, #a3a3a3)", flexShrink: 0 }}>
                          {file.size < 1024 ? `${file.size}B` : file.size < 1048576 ? `${(file.size / 1024).toFixed(0)}KB` : `${(file.size / 1048576).toFixed(1)}MB`}
                        </span>
                        <button
                          onClick={() => removePendingFile(idx)}
                          style={{
                            width: 16, height: 16, borderRadius: "50%", border: "none",
                            background: "rgba(0,0,0,0.08)", color: "var(--text-tertiary, #a3a3a3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", flexShrink: 0, padding: 0,
                          }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(selectedEmployee.status === "active" || (selectedEmployee.status === "provisioning" && selectedEmployee.dropletIp)) ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-end",
                    background: "var(--bg, #ffffff)",
                    borderRadius: 16,
                    border: "1px solid var(--border, #e5e5e5)",
                    padding: "8px 12px",
                  }}
                >
                  {/* Attach file button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending || uploading}
                    title="Attach file"
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "none", cursor: "pointer",
                      background: pendingFiles.length > 0 ? "rgba(37, 99, 235, 0.08)" : "var(--bg-secondary, #f5f5f5)",
                      color: pendingFiles.length > 0 ? "#2563eb" : "var(--text-tertiary, #a3a3a3)",
                      transition: "all 0.2s", flexShrink: 0,
                    }}
                  >
                    <Paperclip size={16} />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={pendingFiles.length > 0 ? `Add a message about the file(s)...` : `Message ${selectedEmployee.name}...`}
                    disabled={sending}
                    rows={1}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      resize: "none",
                      color: "var(--text, #0a0a0a)",
                      fontSize: 14,
                      lineHeight: 1.5,
                      padding: "4px 0",
                      fontFamily: "inherit",
                      maxHeight: 150,
                    }}
                  />
                  {/* Mic button */}
                  {hasSpeechSupport && (
                    <button
                      onClick={listening ? stopListening : startListening}
                      disabled={sending}
                      title={listening ? "Stop listening" : "Voice input"}
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "none", cursor: "pointer",
                        background: listening ? "rgba(239, 68, 68, 0.1)" : "var(--bg-secondary, #f5f5f5)",
                        color: listening ? "#ef4444" : "var(--text-tertiary, #a3a3a3)",
                        transition: "all 0.2s", flexShrink: 0,
                        animation: listening ? "pulse-mic 1.5s ease-in-out infinite" : "none",
                      }}
                    >
                      {listening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && pendingFiles.length === 0) || sending}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      cursor: (input.trim() || pendingFiles.length > 0) && !sending ? "pointer" : "default",
                      background:
                        (input.trim() || pendingFiles.length > 0) && !sending
                          ? "var(--text, #0a0a0a)"
                          : "var(--bg-secondary, #f5f5f5)",
                      color:
                        (input.trim() || pendingFiles.length > 0) && !sending
                          ? "#ffffff"
                          : "var(--text-tertiary, #a3a3a3)",
                      transition: "all 0.2s",
                      flexShrink: 0,
                    }}
                  >
                    {sending ? (
                      <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
              ) : selectedEmployee.status === "provisioning" ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: "rgba(217, 119, 6, 0.06)",
                    border: "1px solid rgba(217, 119, 6, 0.14)",
                  }}
                >
                  <Loader2 size={14} style={{ color: "#d97706", animation: "spin 1.5s linear infinite" }} />
                  <span style={{ fontSize: 13, color: "#b45309" }}>
                    Setting up {selectedEmployee.name}&apos;s workstation...
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "12px 16px",
                    fontSize: 13,
                    color: "var(--text-tertiary, #a3a3a3)",
                  }}
                >
                  Chat is disabled — {selectedEmployee.name} is {selectedEmployee.status}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Voice Call Overlay */}
      {inCall && selectedEmployee && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 32, color: "#ffffff",
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: "rgba(255,255,255,0.1)",
            border: callPhase === "speaking" ? "3px solid #22c55e"
              : callPhase === "listening" ? "3px solid #3b82f6"
              : "3px solid rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 44, transition: "border-color 0.3s",
            animation: callPhase === "listening" ? "pulse-call 2s ease-in-out infinite" : "none",
          }}>
            {selectedEmployee.emoji || selectedEmployee.name.charAt(0)}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{selectedEmployee.name}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
              {callPhase === "listening" ? "Listening..."
                : callPhase === "processing" ? "Thinking..."
                : callPhase === "speaking" ? "Speaking..."
                : "Connected"}
            </div>
          </div>
          <div style={{
            minHeight: 48, maxWidth: 500, padding: "0 24px", textAlign: "center",
            fontSize: 16, color: "rgba(255,255,255,0.8)",
            fontStyle: callTranscript ? "normal" : "italic",
          }}>
            {callTranscript || (callPhase === "listening" ? "Say something..." : "")}
          </div>
          <div style={{
            fontSize: 18, fontWeight: 500, fontVariantNumeric: "tabular-nums",
            color: "rgba(255,255,255,0.5)",
          }}>
            {formatDuration(callDuration)}
          </div>
          <button
            onClick={endCall}
            style={{
              width: 64, height: 64, borderRadius: "50%", border: "none",
              background: "#ef4444", color: "#ffffff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "transform 0.15s, background 0.15s", marginTop: 16,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#dc2626")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ef4444")}
            title="End call"
          >
            <PhoneOff size={28} />
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0) }
          40% { transform: translateY(-6px) }
        }
        @keyframes pulse-mic {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
        }
        @keyframes pulse-call {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 0 16px rgba(59, 130, 246, 0); }
        }
        .typing-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-tertiary, #a3a3a3);
          animation: bounce 1.4s infinite ease-in-out;
        }

        /* Markdown styles */
        .markdown-body { overflow-wrap: break-word; color: var(--text, #0a0a0a); }
        .markdown-body > *:first-child { margin-top: 0; }
        .markdown-body > *:last-child { margin-bottom: 0; }
        .markdown-body p { margin: 0.4em 0; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3,
        .markdown-body h4, .markdown-body h5, .markdown-body h6 {
          margin: 0.6em 0 0.3em; font-weight: 600; line-height: 1.3; color: var(--text, #0a0a0a);
        }
        .markdown-body h1 { font-size: 1.35em; }
        .markdown-body h2 { font-size: 1.2em; }
        .markdown-body h3 { font-size: 1.1em; }
        .markdown-body strong { font-weight: 600; }
        .markdown-body em { font-style: italic; }
        .markdown-body a { color: #2563eb; text-decoration: underline; }
        .markdown-body code {
          font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          font-size: 0.88em; padding: 0.15em 0.4em; border-radius: 4px;
          background: #f5f5f5; border: 1px solid var(--border, #e5e5e5);
        }
        .markdown-body pre {
          margin: 0.5em 0; padding: 12px 14px; border-radius: 8px;
          background: #f9fafb; border: 1px solid var(--border, #e5e5e5); overflow-x: auto;
        }
        .markdown-body pre code { padding: 0; background: none; border: none; font-size: 0.85em; line-height: 1.5; }
        .markdown-body ul, .markdown-body ol { margin: 0.4em 0; padding-left: 1.5em; }
        .markdown-body ul { list-style-type: disc; }
        .markdown-body ol { list-style-type: decimal; }
        .markdown-body li { margin: 0.15em 0; display: list-item; }
        .markdown-body blockquote {
          margin: 0.5em 0; padding: 0.3em 0 0.3em 1em;
          border-left: 3px solid var(--border, #e5e5e5); color: var(--text-secondary, #525252);
        }
        .markdown-body hr { margin: 0.8em 0; border: none; border-top: 1px solid var(--border, #e5e5e5); }
        .markdown-body table { margin: 0.5em 0; border-collapse: collapse; width: 100%; font-size: 0.9em; }
        .markdown-body th, .markdown-body td { padding: 6px 10px; border: 1px solid var(--border, #e5e5e5); text-align: left; }
        .markdown-body th { font-weight: 600; background: var(--bg-secondary, #f5f5f5); }
        .markdown-body img { max-width: 100%; border-radius: 8px; }

        .file-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 10px; margin: 2px 0; border-radius: 6px;
          background: rgba(37, 99, 235, 0.04); border: 1px solid rgba(37, 99, 235, 0.15);
          color: #2563eb; font-size: 12px;
          font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
          cursor: pointer; transition: all 0.15s; text-decoration: none;
        }
        .file-chip:hover { background: rgba(37, 99, 235, 0.1); border-color: rgba(37, 99, 235, 0.3); }
        .file-chip-name { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </div>
  );
}

// ── Helper: format relative time ────────────────

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Chat content components (shared with chat page) ──

const FILE_EXT_RE = /^[\w][\w. -]*\.(csv|tsv|txt|md|pdf|doc|docx|xlsx|xls|html|xml|json|yaml|yml|py|js|ts|tsx|jsx|sh|bash|sql|rb|go|java|css|scss|less|zip|tar|gz|tgz|rar|7z|png|jpe?g|gif|webp|svg|bmp|mp3|mp4|wav|ogg|log|cfg|ini|toml|env|pptx?|rtf)$/i;

function MarkdownText({ text, employeeId }: { text: string; employeeId: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
          img: ({ src, alt }) =>
            typeof src === "string" ? <ImageEmbed src={src} alt={alt || "image"} /> : null,
          code: ({ children, className, ...props }) => {
            if (className) return <code className={className} {...props}>{children}</code>;
            const text = String(children).trim();
            if (FILE_EXT_RE.test(text)) return <FileChip filename={text} employeeId={employeeId} />;
            return <code {...props}>{children}</code>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function MessageContent({ content, employeeId }: { content: string; employeeId: string }) {
  // Handle [Attached: filename] patterns — render as file attachment chips
  const ATTACH_RE = /\[Attached: ([^\]]+)\]/g;
  if (ATTACH_RE.test(content)) {
    ATTACH_RE.lastIndex = 0;
    const segments: Array<{ type: "text" | "attachment"; value: string }> = [];
    let lastIdx = 0;
    let m;
    while ((m = ATTACH_RE.exec(content)) !== null) {
      if (m.index > lastIdx) {
        segments.push({ type: "text", value: content.slice(lastIdx, m.index) });
      }
      segments.push({ type: "attachment", value: m[1] });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < content.length) {
      segments.push({ type: "text", value: content.slice(lastIdx) });
    }
    const filtered = segments.filter((s) => s.type === "attachment" || s.value.trim());
    return (
      <>
        {filtered.map((seg, i) =>
          seg.type === "attachment" ? (
            <UploadedFileChip key={i} filename={seg.value} employeeId={employeeId} />
          ) : (
            // Recursion safe — [Attached:] tags are stripped from text parts
            <MessageContent key={i} content={seg.value} employeeId={employeeId} />
          ),
        )}
      </>
    );
  }

  const imagePattern =
    /`(\/api\/employees\/[^\s`]+\.(?:png|jpe?g|gif|webp|svg|bmp))`|(?:^|[\s:;,(])(\/api\/employees\/[^\s)\]>"'`]+\.(?:png|jpe?g|gif|webp|svg|bmp))/gm;

  const parts: Array<{ type: "text" | "image"; value: string; alt?: string }> = [];
  let lastIndex = 0;
  let match;

  while ((match = imagePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      parts.push({ type: "image", value: match[1].trim(), alt: "image" });
    } else if (match[2]) {
      const url = match[2].trim();
      const leadingChar = match[0].charAt(0);
      if (leadingChar && /[\s:;,(]/.test(leadingChar)) {
        parts.push({ type: "text", value: leadingChar });
      }
      parts.push({ type: "image", value: url, alt: "image" });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  if (parts.length === 0 || parts.every((p) => p.type === "text")) {
    return <MarkdownText text={content} employeeId={employeeId} />;
  }

  return (
    <>
      {parts.map((part, i) =>
        part.type === "image" ? (
          <ImageEmbed key={i} src={part.value} alt={part.alt || "image"} />
        ) : (
          <MarkdownText key={i} text={part.value} employeeId={employeeId} />
        ),
      )}
    </>
  );
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) return FileSpreadsheet;
  if (["py", "js", "ts", "tsx", "jsx", "sh", "bash", "sql", "rb", "go", "java", "css", "scss", "html", "xml", "json", "yaml", "yml"].includes(ext)) return FileCode;
  if (["txt", "md", "log", "rtf", "doc", "docx", "pdf"].includes(ext)) return FileText;
  return File;
}

function FileChip({ filename, employeeId }: { filename: string; employeeId: string }) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(filename);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`/api/employees/${employeeId}/workspace/${encodeURIComponent(filename)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("File not found");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(`/api/employees/${employeeId}/workspace/${encodeURIComponent(filename)}`, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button onClick={handleDownload} disabled={downloading} className="file-chip" title={`Download ${filename}`}>
      <Icon size={13} />
      <span className="file-chip-name">{filename}</span>
      {downloading ? (
        <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
      ) : (
        <Download size={11} />
      )}
    </button>
  );
}

/** Chip for user-uploaded files. Uses the workspace/uploads/ path for downloads. */
function UploadedFileChip({ filename, employeeId }: { filename: string; employeeId: string }) {
  const [downloading, setDownloading] = useState(false);
  const Icon = getFileIcon(filename);
  // Match the server-side sanitization so the download URL uses the actual on-disk name
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const res = await fetch(`/api/employees/${employeeId}/workspace/workspace/uploads/${encodeURIComponent(sanitized)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("File not found");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(`/api/employees/${employeeId}/workspace/workspace/uploads/${encodeURIComponent(sanitized)}`, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      title={`Download ${filename}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 10px", margin: "4px 0",
        borderRadius: 8, border: "1px solid var(--border, #e5e5e5)",
        background: "var(--bg-secondary, #f5f5f5)",
        cursor: "pointer", fontSize: 13, color: "var(--text, #0a0a0a)",
        transition: "all 0.15s",
      }}
    >
      <Icon size={14} style={{ color: "#6b7280", flexShrink: 0 }} />
      <span style={{ fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{filename}</span>
      {downloading ? (
        <Loader2 size={12} style={{ animation: "spin 0.8s linear infinite", color: "#6b7280" }} />
      ) : (
        <Download size={12} style={{ color: "#6b7280" }} />
      )}
    </button>
  );
}

function ImageEmbed({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div style={{ margin: "8px 0" }}>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--bg-secondary, #f5f5f5)",
            border: "1px solid var(--border, #e5e5e5)",
            color: "#2563eb",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          {alt || src.split("/").pop() || "View file"}
        </a>
      </div>
    );
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <a href={src} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onError={() => setError(true)}
          style={{
            maxWidth: "100%",
            maxHeight: 400,
            borderRadius: 8,
            border: "1px solid var(--border, #e5e5e5)",
            cursor: "pointer",
          }}
          loading="lazy"
        />
      </a>
    </div>
  );
}
