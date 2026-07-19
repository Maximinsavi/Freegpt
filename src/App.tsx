import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Plus,
  Trash2,
  Settings,
  Palette,
  Send,
  Sparkles,
  Code,
  PenTool,
  Bot,
  Download,
  Volume2,
  VolumeX,
  Sliders,
  X,
  FileText,
  Image,
  Info,
  Menu,
  Check,
  RefreshCw,
  ExternalLink,
  Copy,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, Conversation, Persona } from './types';
import { PERSONAS } from './data/personas';
import FormattedText from './components/FormattedText';
import VoicePlayer from './components/VoicePlayer';

function TranscriptToggle({ content }: { content: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-1 select-none">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-[10px] text-white/70 hover:text-white underline font-semibold transition-colors cursor-pointer"
      >
        {show ? "Masquer la transcription" : "Afficher la transcription"}
      </button>
      {show && (
        <div className="mt-2 text-xs text-white/90 bg-white/5 border border-white/5 rounded-xl p-2.5 leading-relaxed font-sans break-words max-w-[280px]">
          {content}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // --- Persistent Local States ---
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('freegpt_conversations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse conversations', e);
      }
    }
    // Default initial conversation
    const initialId = crypto.randomUUID();
    return [
      {
        id: initialId,
        title: 'Nouveau Chat',
        messages: [],
        systemInstruction: PERSONAS[0].systemInstruction,
        temperature: 0.7,
        createdAt: new Date().toISOString(),
        personaId: PERSONAS[0].id,
      },
    ];
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const saved = localStorage.getItem('freegpt_active_id');
    if (saved && saved !== 'undefined') {
      return saved;
    }
    return conversations[0]?.id || '';
  });

  // --- UI Layout & Controls ---
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  
  // --- Streaming & API States ---
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem('freegpt_conversations', JSON.stringify(conversations));
    } catch (e) {
      console.warn("Failed to write to localStorage (quota likely exceeded due to base64 images/audios):", e);
    }
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      try {
        localStorage.setItem('freegpt_active_id', activeConversationId);
      } catch (e) {
        console.warn("Failed to write active ID to localStorage:", e);
      }
    }
  }, [activeConversationId]);

  // Scroll to bottom on new messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId) || conversations[0];

  // Close sidebar on mount if on a small or medium screen to prevent covering the viewport
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeConv?.messages, isStreaming, isGeneratingImage]);

  // Handle textarea autosize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Speech Recognition & MediaRecorder (Vocal Dictation + Audio Recording)
  const handleSendMessageRef = useRef<any>(null);

  const startRecordingAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.warn("Failed to start MediaRecorder recording:", err);
    }
  };

  const stopRecordingAudio = (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorderRef.current.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          // Stop all tracks to release the mic
          const stream = mediaRecorderRef.current?.stream;
          stream?.getTracks().forEach((track) => track.stop());

          const base64Url = await blobToBase64(audioBlob);
          resolve(base64Url);
        } catch (err) {
          console.error("Failed to process audio blob to base64:", err);
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'fr-FR';

      rec.onstart = () => {
        setIsListening(true);
        showToast("Enregistrement en cours... Parlez maintenant.");
        startRecordingAudio();
      };

      rec.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
          showToast("Message vocal capturé ! Envoi...");
          const audioUrl = await stopRecordingAudio();
          if (handleSendMessageRef.current) {
            handleSendMessageRef.current(transcript.trim(), 'text', audioUrl);
          }
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          try {
            mediaRecorderRef.current.stop();
            const stream = mediaRecorderRef.current.stream;
            stream?.getTracks().forEach((track) => track.stop());
          } catch (e) {
            console.error(e);
          }
        }
        showToast("Erreur d'écoute ou micro non disponible.");
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      showToast("La reconnaissance vocale n'est pas disponible sur ce navigateur.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Image Attachment Handlers
  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast("Veuillez sélectionner un fichier image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setAttachedImage(event.target.result as string);
        showToast("Photo ajoutée ! Prête à envoyer.");
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Copy Image Blob
  const handleCopyImage = async (base64Url: string) => {
    try {
      const response = await fetch(base64Url);
      const blob = await response.blob();
      
      // Some browsers require PNG for clipboard image writing
      let clipboardBlob = blob;
      if (blob.type === 'image/jpeg') {
        const img = new window.Image();
        img.src = base64Url;
        await new Promise((resolve) => { img.onload = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (pngBlob) {
          clipboardBlob = pngBlob;
        }
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [clipboardBlob.type]: clipboardBlob
        })
      ]);
      showToast("Photo copiée dans le presse-papiers !");
    } catch (err) {
      console.warn("ClipboardItem writing failed:", err);
      // Fallback: copy link text
      try {
        await navigator.clipboard.writeText(base64Url);
        showToast("Données d'image copiées en texte !");
      } catch (innerErr) {
        showToast("Impossible de copier la photo.");
      }
    }
  };

  // Copy assistant response text to clipboard
  const handleCopyResponseText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Réponse copiée dans le presse-papiers !");
    } catch (err) {
      showToast("Impossible de copier la réponse.");
    }
  };

  // Show customized floating notifications
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setIsToastVisible(true);
    setTimeout(() => setIsToastVisible(false), 2500);
  };

  // --- Chat Actions ---
  const handleCreateChat = (personaId = 'general') => {
    const selectedPersona = PERSONAS.find(p => p.id === personaId) || PERSONAS[0];
    const newId = crypto.randomUUID();
    const newChat: Conversation = {
      id: newId,
      title: `Chat ${selectedPersona.name}`,
      messages: [],
      systemInstruction: selectedPersona.systemInstruction,
      temperature: 0.7,
      createdAt: new Date().toISOString(),
      personaId: selectedPersona.id,
    };

    setConversations((prev) => [newChat, ...prev]);
    setActiveConversationId(newId);
    setMode('text');
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleDeleteChat = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (conversations.length === 1) {
      // Just clear the single conversation
      const resetId = crypto.randomUUID();
      setConversations([
        {
          id: resetId,
          title: 'Nouveau Chat',
          messages: [],
          systemInstruction: PERSONAS[0].systemInstruction,
          temperature: 0.7,
          createdAt: new Date().toISOString(),
          personaId: PERSONAS[0].id,
        },
      ]);
      setActiveConversationId(resetId);
      showToast('Conversation réinitialisée');
      return;
    }

    const filtered = conversations.filter((c) => c.id !== idToDelete);
    setConversations(filtered);
    
    if (activeConversationId === idToDelete) {
      setActiveConversationId(filtered[0].id);
    }
    showToast('Conversation supprimée');
  };

  const handleClearAllConversations = () => {
    const resetId = crypto.randomUUID();
    setConversations([
      {
        id: resetId,
        title: 'Nouveau Chat',
        messages: [],
        systemInstruction: PERSONAS[0].systemInstruction,
        temperature: 0.7,
        createdAt: new Date().toISOString(),
        personaId: PERSONAS[0].id,
      },
    ]);
    setActiveConversationId(resetId);
    setIsSettingsOpen(false);
    showToast('Toutes les conversations ont été effacées');
  };

  const handleUpdatePersona = (personaId: string) => {
    const selected = PERSONAS.find((p) => p.id === personaId);
    if (!selected || !activeConv) return;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? {
              ...c,
              personaId: selected.id,
              systemInstruction: selected.systemInstruction,
            }
          : c
      )
    );
    showToast(`Persona changé : ${selected.name}`);
  };

  const handleUpdateTemperature = (temp: number) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConv.id ? { ...c, temperature: temp } : c))
    );
  };

  const handleUpdateSystemInstruction = (inst: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConv.id ? { ...c, systemInstruction: inst } : c))
    );
  };

  // --- Voice / TTS Action ---
  const handleReadAloud = (text: string, msgId: string) => {
    if (speakingMessageId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    
    // Clean code blocks and double asterisks out of read-aloud text
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '[bloc de code]')
      .replace(/\*\*|\*/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fr-FR';
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    
    window.speechSynthesis.speak(utterance);
    setSpeakingMessageId(msgId);
  };

  // Cancel any speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // --- Export Chat as Markdown ---
  const handleExportChat = () => {
    if (!activeConv || activeConv.messages.length === 0) {
      showToast('Aucun message à exporter');
      return;
    }

    let markdown = `# ${activeConv.title}\n\n`;
    markdown += `*Créé le: ${new Date(activeConv.createdAt).toLocaleString('fr-FR')}*\n`;
    markdown += `*Persona de l'IA: ${PERSONAS.find(p => p.id === activeConv.personaId)?.name || 'Général'}*\n`;
    markdown += `*Température de créativité: ${activeConv.temperature}*\n\n`;
    markdown += `---\n\n`;

    activeConv.messages.forEach((msg) => {
      const roleName = msg.role === 'user' ? 'Vous' : 'FreeGPT';
      markdown += `### 👤 ${roleName} (${msg.timestamp})\n\n`;
      markdown += `${msg.content}\n\n`;
      if (msg.imageUrl) {
        markdown += `![Image générée](${msg.imageUrl})\n\n`;
        markdown += `*Prompt de l'image:* \`${msg.imagePrompt}\`\n\n`;
      }
      markdown += `---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeConv.title.toLowerCase().replace(/\s+/g, '_')}_export.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Markdown exporté et téléchargé !');
  };

  // --- Sending Message Engine ---
  const handleSendMessage = async (forcedPrompt?: string, forceMode?: 'text' | 'image', forcedAudioUrl?: string) => {
    const textToSend = forcedPrompt !== undefined ? forcedPrompt : input.trim();
    if (!textToSend && !attachedImage) return;

    const currentMode = forceMode || mode;

    // Save attachment to local variable before resetting state
    const currentAttachment = forcedPrompt === undefined ? attachedImage : null;

    // Reset input box and attachments
    if (forcedPrompt === undefined) {
      setInput('');
      setAttachedImage(null);
    }

    const timestamp = new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // 1. Build & append user's message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: textToSend,
      timestamp,
      type: currentMode,
      attachedImage: currentAttachment || undefined,
      audioUrl: forcedAudioUrl || undefined,
    };

    const isFirstMessage = activeConv.messages.length === 0;
    const newTitle = isFirstMessage
      ? textToSend.length > 25
        ? textToSend.substring(0, 25) + '...'
        : textToSend
      : activeConv.title;

    const updatedMessages = [...activeConv.messages, userMessage];

    // Optimistically update list with user message
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id
          ? { ...c, title: newTitle, messages: updatedMessages }
          : c
      )
    );

    // 2. Branch: Image Generation Mode
    if (currentMode === 'image') {
      setIsGeneratingImage(true);

      const botMsgId = crypto.randomUUID();
      const botPlaceholder: Message = {
        id: botMsgId,
        role: 'assistant',
        content: "Génération de votre image d'art en cours... 🎨✨\n\n*FreeGPT prépare les pinceaux numériques pour dessiner votre imagination...*",
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: 'image',
        isGenerating: true,
        imagePrompt: textToSend,
      };

      // Add generating placeholder message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv.id ? { ...c, messages: [...updatedMessages, botPlaceholder] } : c
        )
      );

      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: textToSend, aspectRatio }),
        });

        const data = await res.json();
        if (data.success && data.imageUrl) {
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id === activeConv.id) {
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === botMsgId
                      ? {
                          ...m,
                          content: data.description || "Voici l'image générée selon votre prompt ! ✨",
                          imageUrl: data.imageUrl,
                          isGenerating: false,
                        }
                      : m
                  ),
                };
              }
              return c;
            })
          );
          showToast('Image générée avec succès !');
        } else {
          throw new Error(data.error || "Aucune image retournée par l'API.");
        }
      } catch (err: any) {
        console.error(err);
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeConv.id) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === botMsgId
                    ? {
                        ...m,
                        content: "Désolé, la génération de l'image a échoué.",
                        error: err.message || "Erreur réseau ou limite d'API atteinte.",
                        isGenerating: false,
                      }
                    : m
                ),
              };
            }
            return c;
          })
        );
      } finally {
        setIsGeneratingImage(false);
      }

    // 3. Branch: Text Generation Mode (SSE Streamed)
    } else {
      setIsStreaming(true);

      const botMsgId = crypto.randomUUID();
      const botPlaceholder: Message = {
        id: botMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: 'text',
        isGenerating: true,
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConv.id ? { ...c, messages: [...updatedMessages, botPlaceholder] } : c
        )
      );

      try {
        const activePersona = PERSONAS.find((p) => p.id === activeConv.personaId) || PERSONAS[0];
        const systemInstruction = activeConv.systemInstruction || activePersona.systemInstruction;

        // Strip placeholder and image payloads for context to feed Gemini cleanly, but keep text and attached images
        const textHistory = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
          attachedImage: m.attachedImage,
        }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: textHistory,
            systemInstruction,
            temperature: activeConv.temperature,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "Erreur inconnue");
          throw new Error(`Erreur du serveur (Statut ${res.status}): ${errText || res.statusText}`);
        }

        if (!res.body) {
          throw new Error("Impossible d'initialiser le flux de réponse.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let streamAccumulator = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          
          if (value) {
            buffer += decoder.decode(value, { stream: true });
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith('data: ')) {
              const dataValue = trimmedLine.substring(6).trim();
              if (dataValue === '[DONE]') {
                break;
              }
              
              let parsed: any = null;
              try {
                parsed = JSON.parse(dataValue);
              } catch (e) {
                // Ignore incomplete line parse failure
              }

              if (parsed) {
                if (parsed.text) {
                  streamAccumulator += parsed.text;
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id === activeConv.id) {
                        return {
                          ...c,
                          messages: c.messages.map((m) =>
                            m.id === botMsgId
                              ? {
                                  ...m,
                                  content: streamAccumulator,
                                  isGenerating: false,
                                }
                              : m
                          ),
                        };
                      }
                      return c;
                    })
                  );
                } else if (parsed.error) {
                  throw new Error(parsed.error);
                }
              }
            }
          }

          if (done) {
            const remainingLine = buffer.trim();
            if (remainingLine.startsWith('data: ')) {
              const dataValue = remainingLine.substring(6).trim();
              if (dataValue && dataValue !== '[DONE]') {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(dataValue);
                } catch (e) {
                  // Ignore parse error
                }

                if (parsed) {
                  if (parsed.text) {
                    streamAccumulator += parsed.text;
                    setConversations((prev) =>
                      prev.map((c) => {
                        if (c.id === activeConv.id) {
                          return {
                            ...c,
                            messages: c.messages.map((m) =>
                              m.id === botMsgId
                                ? {
                                    ...m,
                                    content: streamAccumulator,
                                    isGenerating: false,
                                  }
                                : m
                            ),
                          };
                        }
                        return c;
                      })
                    );
                  } else if (parsed.error) {
                    throw new Error(parsed.error);
                  }
                }
              }
            }
            break;
          }
        }
      } catch (err: any) {
        console.error(err);
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeConv.id) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === botMsgId
                    ? {
                        ...m,
                        content: "Une erreur est survenue lors de la communication avec l'IA.",
                        error: err.message || "Serveur injoignable ou erreur interne.",
                        isGenerating: false,
                      }
                    : m
                ),
              };
            }
            return c;
          })
        );
      } finally {
        setIsStreaming(false);
      }
    }
  };

  handleSendMessageRef.current = handleSendMessage;

  const activePersona = PERSONAS.find((p) => p.id === activeConv?.personaId) || PERSONAS[0];

  return (
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-slate-50 font-sans text-slate-800">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {isToastVisible && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-xl backdrop-blur-md"
          >
            <Sparkles className="h-4 w-4 text-emerald-600 animate-pulse" />
            <span className="text-xs sm:text-sm font-semibold text-slate-800">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-display text-base sm:text-lg font-bold text-slate-950">Configuration de l'IA</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-6">
                {/* System Prompt Customization */}
                <div>
                  <label className="mb-2 block text-xs sm:text-sm font-bold text-slate-700">
                    Instructions Système Personnalisées
                  </label>
                  <textarea
                    value={activeConv.systemInstruction}
                    onChange={(e) => handleUpdateSystemInstruction(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="Saisissez des instructions système pour guider le comportement..."
                  />
                  <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                    Définit la personnalité d'arrière-plan de l'assistant pour ce fil de discussion.
                  </p>
                </div>

                {/* Temperature Adjustment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs sm:text-sm font-bold text-slate-700">
                      Température de Créativité
                    </label>
                    <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {activeConv.temperature}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.1"
                    value={activeConv.temperature}
                    onChange={(e) => handleUpdateTemperature(parseFloat(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-205 accent-emerald-600"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Précis (0.0)</span>
                    <span>Équilibré (0.7)</span>
                    <span>Créatif (1.2)</span>
                  </div>
                </div>

                {/* Clear and Reset Actions */}
                <div className="border-t border-slate-100 pt-5 flex flex-col gap-2.5">
                  <button
                    onClick={handleClearAllConversations}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 border border-red-200/60 py-2.5 text-xs sm:text-sm font-bold text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    Effacer toutes les conversations
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Info / About Modal */}
      <AnimatePresence>
        {isInfoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-display text-base sm:text-lg font-bold text-slate-950">À propos de FreeGPT</h3>
                </div>
                <button
                  onClick={() => setIsInfoOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-6 overflow-y-auto">
                <div className="text-center pb-4 border-b border-slate-100">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 font-bold mb-2.5 shadow-xs">
                    🤖
                  </div>
                  <h4 className="text-lg font-black text-slate-900">FreeGPT v1.2</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Développé avec passion par <span className="font-bold text-emerald-600">Maximin Savi</span>
                  </p>
                </div>

                <div className="space-y-4">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fonctionnalités Clés</h5>
                  
                  <div className="space-y-3.5">
                    <div className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-xs">
                        💬
                      </div>
                      <div>
                        <h6 className="text-xs sm:text-sm font-bold text-slate-800">Assistant IA Multitâche</h6>
                        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                          Génération de réponses ultra-rapides et intelligentes propulsées par <span className="font-semibold text-slate-700">Gemini 3.5 Flash</span>. Adaptez le ton de l'assistant grâce aux 4 personas spécialisés.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs">
                        🎨
                      </div>
                      <div>
                        <h6 className="text-xs sm:text-sm font-bold text-slate-800">Créateur d'Images IA d'Art</h6>
                        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                          Entrez n'importe quelle idée et l'IA traduira et enrichira automatiquement votre prompt en anglais pour générer des œuvres d'art visuel haute définition dans plusieurs formats d'image.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600 text-xs">
                        🎙️
                      </div>
                      <div>
                        <h6 className="text-xs sm:text-sm font-bold text-slate-800">Messages Vocaux Réels</h6>
                        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                          Dictez vos messages ! L'application enregistre votre véritable voix en arrière-plan, intègre un lecteur audio interactif et génère en parallèle une transcription textuelle complète.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 text-xs">
                        ⚙️
                      </div>
                      <div>
                        <h6 className="text-xs sm:text-sm font-bold text-slate-800">Personnalisation Totale</h6>
                        <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                          Ajustez la température (créativité) ou rédigez des instructions système pour façonner les réponses de l'IA selon vos besoins exacts.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs text-slate-500 space-y-1">
                  <div className="font-bold text-slate-700 mb-1">Fiche Technique :</div>
                  <div>• <span className="font-semibold text-slate-600">Frontend :</span> React 18, Tailwind CSS, Motion</div>
                  <div>• <span className="font-semibold text-slate-600">Backend :</span> Node.js, Express, Google GenAI SDK</div>
                  <div>• <span className="font-semibold text-slate-600">Stockage :</span> Persistance locale sécurisée (localStorage)</div>
                  <div>• <span className="font-semibold text-slate-600">Auteur :</span> Maximin Savi</div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 text-center shrink-0">
                <button
                  onClick={() => setIsInfoOpen(false)}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition-colors cursor-pointer shadow-sm shadow-emerald-600/10"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-35 bg-slate-900/40 md:hidden backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      {/* Collapsible Left Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-45 flex flex-col bg-white transition-all duration-300 overflow-hidden
          ${isSidebarOpen ? 'w-72 translate-x-0 border-r border-slate-200' : 'w-0 -translate-x-full'}
          md:static md:h-full md:translate-x-0
          ${isSidebarOpen ? 'md:w-80 md:border-r md:border-slate-200' : 'md:w-0 md:border-none'}
        `}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Bot className="h-5 w-5 text-emerald-600" />
            </div>
            <span className="font-display text-base sm:text-lg font-black tracking-tight text-slate-900 select-none">
              Free<span className="text-emerald-600">GPT</span>
            </span>
          </div>
          
          {/* Collapse button for mobile */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Start New Chat Action Button */}
        <div className="p-3">
          <button
            onClick={() => handleCreateChat('general')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-250 bg-slate-50 hover:bg-slate-100 hover:border-emerald-500/40 px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-all cursor-pointer shadow-xs group"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
            Nouveau Chat
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          <div className="px-3 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
            Historique des chats
          </div>
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const persona = PERSONAS.find((p) => p.id === conv.personaId) || PERSONAS[0];

            return (
              <div
                key={conv.id}
                onClick={() => {
                  setActiveConversationId(conv.id);
                  if (window.innerWidth < 768) {
                    setIsSidebarOpen(false);
                  }
                }}
                className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs sm:text-sm cursor-pointer transition-all ${
                  isActive
                    ? 'bg-slate-100 border border-slate-200 text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="text-base select-none">{persona.emoji}</span>
                  <div className="truncate text-[13px] text-slate-700 font-medium group-hover:text-slate-900">
                    {conv.title === 'Nouveau Chat' ? 'Chat vide' : conv.title}
                  </div>
                </div>

                <button
                  onClick={(e) => handleDeleteChat(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:bg-slate-200 hover:text-red-500 transition-all cursor-pointer"
                  title="Supprimer la conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-150 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xs font-mono font-bold text-emerald-600 select-none border border-emerald-500/20">
              v1.2
            </div>
            <div className="text-xs">
              <div className="font-bold text-slate-800">FreeGPT</div>
              <div className="text-[10px] text-slate-500 font-medium">Par Maximin Savi</div>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-emerald-600 transition-colors cursor-pointer"
              title="À propos du site (Par Maximin Savi)"
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-emerald-600 transition-colors cursor-pointer"
              title="Paramètres de l'IA"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex flex-1 flex-col h-full bg-slate-50 relative overflow-hidden min-w-0">
        
        {/* Workspace Top Header Bar */}
        <header className="flex h-16 items-center justify-between px-3 sm:px-6 border-b border-slate-200/80 bg-white/95 backdrop-blur-md relative z-30 select-none w-full max-w-full">
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            {/* Collapsible toggler */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Current Persona Status Display */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-base sm:text-lg select-none shrink-0">{activePersona.emoji}</span>
              <h2 className="font-display text-[13.5px] sm:text-[14.5px] font-bold text-slate-900 tracking-wide truncate">
                {activePersona.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Mode selection buttons */}
            <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200/60">
              <button
                onClick={() => setMode('text')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
                  mode === 'text'
                    ? 'bg-white border border-slate-200/80 shadow-xs text-emerald-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Bot className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline text-[10.5px]">Texte</span>
              </button>
              <button
                onClick={() => setMode('image')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold tracking-wide transition-all ${
                  mode === 'image'
                    ? 'bg-white border border-slate-200/80 shadow-xs text-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Palette className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden xs:inline text-[10.5px]">Image</span>
              </button>
            </div>

            {/* Export action */}
            {activeConv && activeConv.messages.length > 0 && (
              <button
                onClick={handleExportChat}
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-all cursor-pointer shadow-xs"
                title="Exporter l'historique en Markdown"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Exporter</span>
              </button>
            )}

            {/* Settings button */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-slate-50 p-2 text-slate-600 hover:text-emerald-600 transition-all cursor-pointer shadow-xs"
              title="Ajuster la créativité"
            >
              <Sliders className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Chat Stream Window Content */}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 select-text w-full max-w-full bg-slate-50/50 [webkit-overflow-scrolling:touch]">
          <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6 w-full">
            
            {activeConv.messages.length === 0 ? (
              // Empty/First launch screen
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5 py-2"
              >
                {/* Clean white branding card */}
                <div className="text-center space-y-2 py-4">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 shadow-xs mb-1">
                    <Bot className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h1 className="font-display text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Comment puis-je vous aider aujourd'hui ?
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                    Saisissez votre question ou basculez en mode photo en haut pour concevoir de superbes visuels.
                  </p>
                </div>

                {/* Persona selector cards */}
                <div className="space-y-2.5">
                  <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest text-center select-none">
                    Spécialisation de l'assistant
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {PERSONAS.map((p) => {
                      const isSelected = activeConv.personaId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleUpdatePersona(p.id)}
                          className={`flex flex-col p-3.5 rounded-xl border cursor-pointer text-left transition-all relative ${
                            isSelected
                              ? 'bg-white border-emerald-500 shadow-sm ring-1 ring-emerald-500/20'
                              : 'bg-white border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-lg select-none">{p.emoji}</span>
                            {isSelected && (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 border border-emerald-200/60">
                                Actif
                              </span>
                            )}
                          </div>
                          <h3 className="font-display text-[13px] font-bold text-slate-900 mb-0.5">
                            {p.name}
                          </h3>
                          <p className="text-[10.5px] text-slate-500 leading-normal line-clamp-2">
                            {p.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick starter prompts */}
                <div className="space-y-2.5 pt-2">
                  <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest text-center select-none">
                    Suggestions rapides
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
                    <button
                      onClick={() => {
                        setMode('image');
                        handleSendMessage("Un majestueux chat astronaute flottant dans l'espace cosmique réaliste, néons colorés, peinture numérique de haute qualité", 'image');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50 hover:border-indigo-500/30 transition-all cursor-pointer group shadow-xs"
                    >
                      <span className="text-base bg-indigo-50 p-2 rounded-lg text-indigo-600 group-hover:scale-105 transition-transform select-none">🎨</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-xs">Générer une photo (Mode Image)</div>
                        <div className="text-slate-400 truncate text-[11px]">"Un majestueux chat astronaute dans l'espace..."</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setMode('text');
                        handleSendMessage("Rédige un poème nostalgique de trois strophes sur le coucher de soleil et l'océan.", 'text');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-50 hover:border-emerald-500/30 transition-all cursor-pointer group shadow-xs"
                    >
                      <span className="text-base bg-amber-50 p-2 rounded-lg text-amber-600 group-hover:scale-105 transition-transform select-none">✍️</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-xs">Rédiger un poème poétique</div>
                        <div className="text-slate-400 truncate text-[11px]">"Rédige un poème nostalgique de trois strophes..."</div>
                      </div>
                    </button>
                  </div>
                </div>

              </motion.div>
            ) : (
              // Active Conversation Thread List
              <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-hidden">
                {activeConv.messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const msgPersona = PERSONAS.find((p) => p.id === activeConv.personaId) || PERSONAS[0];

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2.5 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'} w-full max-w-full overflow-hidden`}
                    >
                      {/* Avatar icon */}
                      {!isUser && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 font-sans text-sm select-none shadow-xs text-slate-700">
                          {msgPersona.emoji}
                        </div>
                      )}

                      {/* Content Frame */}
                      <div
                        className={`flex flex-col max-w-[88%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4.5 shadow-xs border min-w-0 break-words [word-break:break-word] overflow-hidden ${
                          isUser
                            ? 'bg-emerald-600 border-emerald-700/10 text-white rounded-tr-none'
                            : 'bg-white border-slate-200/80 text-slate-800 rounded-tl-none'
                        }`}
                      >
                        {/* Meta header information */}
                        <div className={`flex items-center justify-between gap-6 mb-2 border-b pb-1.5 text-[10px] font-semibold select-none uppercase tracking-wider ${
                          isUser ? 'border-white/15 text-white/80' : 'border-slate-100 text-slate-400'
                        }`}>
                          <span>{isUser ? 'Vous' : `FreeGPT ${msgPersona.name}`}</span>
                          <div className="flex items-center gap-1.5">
                            <span>{msg.timestamp}</span>
                            {msg.type === 'image' && (
                              <span className="rounded bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">
                                Image
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Speech or error states */}
                        {msg.error ? (
                          <div className="space-y-2 rounded-xl bg-red-50 border border-red-150 p-3 text-xs sm:text-sm text-red-600 font-mono">
                            <p className="font-bold">Erreur de génération :</p>
                            <p className="text-xs leading-normal">{msg.error}</p>
                          </div>
                        ) : (
                          <div className="space-y-3.5 w-full max-w-full overflow-hidden">
                            {/* Render User Attached Image */}
                            {msg.attachedImage && (
                              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 max-w-xs mb-2">
                                <img
                                  src={msg.attachedImage}
                                  alt="Photo attachée"
                                  className="h-auto max-h-48 w-full object-contain"
                                />
                              </div>
                            )}

                            {/* Render Image or Text */}
                            {msg.imageUrl ? (
                              <div className="space-y-2.5 w-full max-w-full">
                                <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-xs max-w-full">
                                  <img
                                    src={msg.imageUrl}
                                    alt={msg.imagePrompt || 'Visuel généré par FreeGPT'}
                                    className="h-auto max-h-[360px] sm:max-h-[420px] w-full object-contain transition-transform duration-500 group-hover:scale-[1.01]"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <a
                                      href={msg.imageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-lg bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 text-slate-800 transition-all shadow-md flex items-center gap-1.5 text-xs font-semibold select-none cursor-pointer"
                                    >
                                      <ExternalLink className="h-4 w-4 text-slate-600" />
                                      Ouvrir en grand
                                    </a>
                                  </div>
                                </div>
                                {msg.imagePrompt && (
                                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 font-mono text-[10.5px] text-slate-500 tracking-wide leading-relaxed break-words [word-break:break-word] overflow-hidden">
                                    <span className="font-bold text-indigo-600 uppercase mr-1 select-none">Prompt :</span>
                                    "{msg.imagePrompt}"
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {/* Render Text Body formatted as Markdown or Voice Player */}
                            {msg.audioUrl ? (
                              <div className="space-y-2">
                                <VoicePlayer audioUrl={msg.audioUrl} />
                                <TranscriptToggle content={msg.content} />
                              </div>
                            ) : (
                              msg.content && (
                                <div className={isUser ? 'text-white' : 'text-slate-800'}>
                                  <FormattedText content={msg.content} />
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {/* Bottom action utilities */}
                        {!isUser && !msg.isGenerating && (
                          <div className={`mt-3.5 flex flex-wrap items-center gap-1.5 border-t pt-2 text-[10.5px] select-none ${
                            isUser ? 'border-white/10' : 'border-slate-100'
                          }`}>
                            <button
                              onClick={() => handleReadAloud(msg.content, msg.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                                speakingMessageId === msg.id
                                  ? 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse'
                                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                              }`}
                              title={speakingMessageId === msg.id ? "Arrêter la lecture" : "Lire à haute voix"}
                            >
                              {speakingMessageId === msg.id ? (
                                <>
                                  <VolumeX className="h-3 w-3" />
                                  <span>Arrêter</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-3 w-3" />
                                  <span>Lecture</span>
                                </>
                              )}
                            </button>

                            {msg.content && (
                              <button
                                onClick={() => handleCopyResponseText(msg.content)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px] font-semibold transition-all cursor-pointer"
                                title="Copier le texte dans le presse-papiers"
                              >
                                <Copy className="h-3 w-3" />
                                <span>Copier</span>
                              </button>
                            )}

                            {msg.imageUrl && (
                              <>
                                <button
                                  onClick={() => handleCopyImage(msg.imageUrl!)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px] font-semibold transition-all cursor-pointer"
                                  title="Copier le lien de la photo"
                                >
                                  <Copy className="h-3 w-3" />
                                  <span>Copier photo</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setMode('image');
                                    handleSendMessage(msg.imagePrompt, 'image');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[11px] font-semibold transition-all cursor-pointer"
                                  title="Générer une autre variante"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  <span>Variante</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* User's profile icon */}
                      {isUser && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-550 border border-emerald-600 font-display text-sm font-bold text-white select-none shadow-xs">
                          U
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {/* Loading indicators */}
                {isGeneratingImage && (
                  <div className="flex items-center gap-2 text-indigo-600 text-[11px] sm:text-xs font-mono select-none px-12 sm:px-13 animate-pulse">
                    <Palette className="h-3.5 w-3.5 animate-spin" />
                    <span>Création artistique en cours...</span>
                  </div>
                )}

                {isStreaming && (
                  <div className="flex items-center gap-2 text-emerald-600 text-[11px] sm:text-xs font-mono select-none px-12 sm:px-13 animate-pulse">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                    <span>FreeGPT répond en temps réel...</span>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} className="h-6" />
          </div>
        </div>

        {/* Input Bar & Mode Selector Controls */}
        <footer className="border-t border-gray-850/80 bg-gray-950/35 backdrop-blur-md p-4 select-none relative z-20">
          <div className="mx-auto max-w-4xl space-y-3">
            
            {/* Dynamic controls panel depending on current mode */}
            {mode === 'image' && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl"
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <Palette className="h-4 w-4 text-indigo-600" />
                  <span className="text-[11px] sm:text-xs font-bold text-indigo-800">Format de Photo (Aspect Ratio)</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`px-2.5 py-1 rounded-lg text-[10.5px] font-mono font-bold border transition-all cursor-pointer ${
                        aspectRatio === ratio
                          ? 'bg-indigo-600 border-indigo-650 text-white shadow-xs font-black'
                          : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Input Form Box */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex flex-col bg-slate-50 border border-slate-200 rounded-2xl p-1.5 focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-emerald-500/10 transition-all shadow-xs"
            >
              {/* Image attachment preview */}
              {attachedImage && (
                <div className="relative inline-block self-start ml-2 mb-2 group shrink-0">
                  <img
                    src={attachedImage}
                    alt="Attachement"
                    className="h-14 w-14 object-cover rounded-lg border border-slate-200 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="absolute -top-1.5 -right-1.5 bg-white text-slate-400 hover:text-slate-800 rounded-full p-0.5 border border-slate-200 shadow-md cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-1.5 sm:gap-2">
                {/* Paperclip button to attach image */}
                <button
                  type="button"
                  onClick={triggerFileSelect}
                  className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all shrink-0 cursor-pointer shadow-xs"
                  title="Ajouter une photo"
                >
                  <Image className="h-4.5 w-4.5" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                {/* Image shortcut toggle icon */}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'text' ? 'image' : 'text')}
                  className={`p-2 sm:p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer shadow-xs ${
                    mode === 'image'
                      ? 'bg-indigo-50 border-indigo-150 text-indigo-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                  title={mode === 'image' ? "Passer en mode texte" : "Passer en mode génération photo"}
                >
                  <Palette className="h-4.5 w-4.5" />
                </button>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      const isMobile = window.matchMedia("(max-width: 768px)").matches || /Mobi|Android|iPhone/i.test(navigator.userAgent);
                      if (!isMobile) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }
                  }}
                  rows={1}
                  placeholder={
                    mode === 'image'
                      ? "Décrivez précisément la photo à générer (ex: 'un chat astronaute')..."
                      : `Discutez avec l'assistant ou demandez du code...`
                  }
                  className="flex-1 max-h-48 resize-none bg-transparent border-0 py-2 px-1 text-[13.5px] sm:text-[14.5px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-0 leading-relaxed font-sans"
                  disabled={isStreaming || isGeneratingImage}
                />

                {/* Vocal speech mic toggle button */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 sm:p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer shadow-xs ${
                    isListening
                      ? 'bg-red-50 border-red-200 text-red-600 animate-pulse'
                      : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                  }`}
                  title="Saisie vocale (Dictée)"
                >
                  <Mic className="h-4.5 w-4.5" />
                </button>

                {/* Submit trigger button */}
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachedImage) || isStreaming || isGeneratingImage}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer shrink-0 shadow-xs ${
                    (!input.trim() && !attachedImage) || isStreaming || isGeneratingImage
                      ? 'bg-slate-100 text-slate-350 border border-slate-200/60 cursor-not-allowed'
                      : mode === 'image'
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-500/20'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-500/20'
                  }`}
                  title="Envoyer la requête"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </form>

            <div className="flex flex-col sm:flex-row items-center justify-between text-[10.5px] text-slate-400 gap-1.5 px-1 font-sans select-none leading-none text-center sm:text-left font-medium">
              <div className="flex items-center gap-1">
                <Info className="h-3 w-3 text-slate-400 shrink-0" />
                <span>Modèle : Gemini 3.5 & Imagen.</span>
              </div>
              <div className="hidden sm:block">
                <span>Presser Entrée pour envoyer, Maj+Entrée pour sauter une ligne.</span>
              </div>
            </div>

          </div>
        </footer>

      </div>
    </div>
  );
}
