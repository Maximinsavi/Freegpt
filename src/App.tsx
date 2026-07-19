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

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('freegpt_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('freegpt_active_id', activeConversationId);
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

  // Speech Recognition (Vocal Dictation - Sent directly to Chat)
  const handleSendMessageRef = useRef<any>(null);

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
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim()) {
          showToast("Message vocal capturé ! Envoi...");
          if (handleSendMessageRef.current) {
            handleSendMessageRef.current(transcript.trim());
          }
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
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
  const handleSendMessage = async (forcedPrompt?: string, forceMode?: 'text' | 'image') => {
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
        const decoder = new TextDecoder();
        let streamAccumulator = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const trimmedLine = buffer.trim();
            if (trimmedLine.startsWith('data: ')) {
              const dataValue = trimmedLine.substring(6).trim();
              if (dataValue && dataValue !== '[DONE]') {
                try {
                  const parsed = JSON.parse(dataValue);
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
                  }
                } catch (e) {}
              }
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last item in buffer since it might be an incomplete line
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            if (trimmedLine.startsWith('data: ')) {
              const dataValue = trimmedLine.substring(6).trim();
              if (dataValue === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(dataValue);
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
              } catch (e) {
                // Ignore incomplete line parse failure
              }
            }
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
    <div className="flex h-[100dvh] w-full max-w-full overflow-hidden bg-gray-950 font-sans text-gray-100">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {isToastVisible && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/95 px-4 py-2.5 shadow-2xl backdrop-blur-md"
          >
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium text-gray-200">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-gray-800 p-5">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-display text-lg font-bold">Configuration de l'IA</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6 p-6">
                {/* System Prompt Customization */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-300">
                    Instructions Système Personnalisées
                  </label>
                  <textarea
                    value={activeConv.systemInstruction}
                    onChange={(e) => handleUpdateSystemInstruction(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-gray-800 bg-gray-950 p-3 text-sm text-gray-200 placeholder-gray-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/35"
                    placeholder="Saisissez des instructions système pour guider le comportement..."
                  />
                  <p className="mt-1 text-xs text-gray-500 leading-normal">
                    Définit la personnalité d'arrière-plan de l'assistant pour ce fil de discussion.
                  </p>
                </div>

                {/* Temperature Adjustment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-300">
                      Température de Créativité
                    </label>
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/30">
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
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-gray-850 accent-emerald-500"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-gray-500 font-mono uppercase">
                    <span>Plus Précis (0.0)</span>
                    <span>Équilibré (0.7)</span>
                    <span>Plus Créatif (1.2)</span>
                  </div>
                </div>

                {/* Clear and Reset Actions */}
                <div className="border-t border-gray-800/80 pt-5 flex flex-col gap-2.5">
                  <button
                    onClick={handleClearAllConversations}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-950/20 border border-red-900/40 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-950/40 transition-colors"
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

      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-35 bg-black/60 md:hidden backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      {/* Collapsible Left Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-45 flex flex-col bg-gray-950 transition-all duration-300 overflow-hidden
          ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full'}
          md:static md:h-full md:translate-x-0
          ${isSidebarOpen ? 'md:w-80 md:border-r md:border-gray-800/60' : 'md:w-0 md:border-none'}
        `}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-800/50">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Bot className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white select-none">
              Free<span className="text-emerald-400">GPT</span>
            </span>
          </div>
          
          {/* Collapse button for mobile */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-900 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Start New Chat Action Button */}
        <div className="p-4">
          <button
            onClick={() => handleCreateChat('general')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-800 bg-gray-900/50 hover:bg-gray-900 hover:border-emerald-500/40 px-4 py-3 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-all cursor-pointer shadow-sm group"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:scale-110" />
            Nouveau Chat
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
          <div className="px-3 mb-2 text-[11px] font-bold text-gray-500 uppercase tracking-widest select-none">
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
                className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-all ${
                  isActive
                    ? 'bg-gray-900 border border-gray-850 text-white font-medium shadow-md'
                    : 'text-gray-400 hover:bg-gray-900/60 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="text-base select-none">{persona.emoji}</span>
                  <div className="truncate text-[13.5px]">
                    {conv.title === 'Nouveau Chat' ? 'Chat vide' : conv.title}
                  </div>
                </div>

                <button
                  onClick={(e) => handleDeleteChat(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-500 hover:bg-gray-800 hover:text-red-400 transition-all"
                  title="Supprimer la conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer: App info and quick settings toggle */}
        <div className="p-4 border-t border-gray-800/50 bg-gray-900/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-mono font-bold text-gray-400 select-none">
              v1
            </div>
            <div className="text-xs">
              <div className="font-semibold text-gray-300">ChatGPT Free</div>
              <div className="text-gray-500">Crédits Illimités</div>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-900 hover:text-emerald-400 transition-colors"
            title="Paramètres de l'IA"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex flex-1 flex-col h-full bg-gray-900/20 relative">
        
        {/* Workspace Top Header Bar */}
        <header className="flex h-16 items-center justify-between px-6 border-b border-gray-800/50 bg-gray-950/30 backdrop-blur-md relative z-30 select-none">
          <div className="flex items-center gap-4">
            {/* Collapsible toggler */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-900 hover:text-white transition-all cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Current Persona Status Display */}
            <div className="flex items-center gap-2">
              <span className="text-lg">{activePersona.emoji}</span>
              <div className="hidden sm:block">
                <h2 className="font-display text-[14.5px] font-bold text-white tracking-wide whitespace-nowrap">
                  {activePersona.name}
                </h2>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Mode selection buttons */}
            <div className="flex items-center gap-1 bg-gray-950/80 p-1 rounded-xl border border-gray-850/80">
              <button
                onClick={() => setMode('text')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  mode === 'text'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Texte</span>
              </button>
              <button
                onClick={() => setMode('image')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  mode === 'image'
                    ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Palette className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Image</span>
              </button>
            </div>

            {/* Export action */}
            {activeConv && activeConv.messages.length > 0 && (
              <button
                onClick={handleExportChat}
                className="hidden sm:flex items-center gap-1.5 rounded-xl border border-gray-800 bg-gray-950/50 hover:bg-gray-900 hover:text-white px-3 py-2 text-xs font-semibold text-gray-300 transition-all cursor-pointer"
                title="Exporter l'historique en Markdown"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exporter</span>
              </button>
            )}

            {/* Direct configurations slider */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center rounded-xl border border-gray-800 bg-gray-950/50 hover:bg-gray-900 p-2 text-gray-300 transition-all cursor-pointer hover:text-emerald-400"
              title="Ajuster la créativité"
            >
              <Sliders className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Chat Stream Window Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 select-text">
          <div className="mx-auto max-w-4xl space-y-6">
            
            {activeConv.messages.length === 0 ? (
              // Empty/First launch screen
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 py-4"
              >

                {/* Persona selector cards */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest text-center select-none">
                    Choisissez une spécialisation pour ce chat
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {PERSONAS.map((p) => {
                      const isSelected = activeConv.personaId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleUpdatePersona(p.id)}
                          className={`flex flex-col p-4 rounded-xl border cursor-pointer text-left transition-all relative ${
                            isSelected
                              ? 'bg-gray-900/80 border-emerald-500/40 shadow-lg shadow-emerald-950/5'
                              : 'bg-gray-950/55 border-gray-850/60 hover:bg-gray-900/40 hover:border-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xl select-none">{p.emoji}</span>
                            {isSelected && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">
                                Actif
                              </span>
                            )}
                          </div>
                          <h3 className="font-display text-[13.5px] font-bold text-white mb-1">
                            {p.name}
                          </h3>
                          <p className="text-[11px] text-gray-400 leading-normal">
                            {p.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick starter prompts */}
                <div className="space-y-3 pt-4">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-widest text-center select-none">
                    Exemples de requêtes rapides
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                    <button
                      onClick={() => {
                        setMode('image');
                        handleSendMessage("Un majestueux chat astronaute flottant dans l'espace cosmique réaliste, néons colorés, peinture numérique de haute qualité", 'image');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-gray-850/65 bg-gray-950/45 p-3.5 text-left text-[13px] text-gray-300 hover:bg-gray-900/60 hover:border-indigo-500/30 transition-all cursor-pointer group"
                    >
                      <span className="text-lg bg-indigo-500/10 p-1.5 rounded-lg text-indigo-400 group-hover:scale-105 transition-transform select-none">🎨</span>
                      <div>
                        <div className="font-bold text-white text-xs">Générer une photo (Mode Image)</div>
                        <div className="text-gray-400 truncate text-[11px]">"Un majestueux chat astronaute dans l'espace..."</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setMode('text');
                        handleSendMessage("Explique comment implémenter une communication par streaming de Server-Sent Events (SSE) avec Node.js et Express.", 'text');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-gray-850/65 bg-gray-950/45 p-3.5 text-left text-[13px] text-gray-300 hover:bg-gray-900/60 hover:border-emerald-500/30 transition-all cursor-pointer group"
                    >
                      <span className="text-lg bg-emerald-500/10 p-1.5 rounded-lg text-emerald-400 group-hover:scale-105 transition-transform select-none">💻</span>
                      <div>
                        <div className="font-bold text-white text-xs">Expliquer du code complexe</div>
                        <div className="text-gray-400 truncate text-[11px]">"Explique comment implémenter du streaming SSE..."</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setMode('text');
                        handleSendMessage("Rédige un poème nostalgique de trois strophes sur le coucher de soleil et l'océan.", 'text');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-gray-850/65 bg-gray-950/45 p-3.5 text-left text-[13px] text-gray-300 hover:bg-gray-900/60 hover:border-emerald-500/30 transition-all cursor-pointer group"
                    >
                      <span className="text-lg bg-amber-500/10 p-1.5 rounded-lg text-amber-400 group-hover:scale-105 transition-transform select-none">✍️</span>
                      <div>
                        <div className="font-bold text-white text-xs">Rédiger un poème poétique</div>
                        <div className="text-gray-400 truncate text-[11px]">"Rédige un poème nostalgique de trois strophes..."</div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setMode('text');
                        handleSendMessage("Quels sont les 5 principes du Clean Code indispensables pour un développeur senior ?", 'text');
                      }}
                      className="flex items-center gap-3 rounded-xl border border-gray-850/65 bg-gray-950/45 p-3.5 text-left text-[13px] text-gray-300 hover:bg-gray-900/60 hover:border-emerald-500/30 transition-all cursor-pointer group"
                    >
                      <span className="text-lg bg-sky-500/10 p-1.5 rounded-lg text-sky-400 group-hover:scale-105 transition-transform select-none">💡</span>
                      <div>
                        <div className="font-bold text-white text-xs">Meilleures pratiques et conseils</div>
                        <div className="text-gray-400 truncate text-[11px]">"Quels sont les 5 principes du Clean Code..."</div>
                      </div>
                    </button>
                  </div>
                </div>

              </motion.div>
            ) : (
              // Active Conversation Thread List
              <div className="space-y-6">
                {activeConv.messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const msgPersona = PERSONAS.find((p) => p.id === activeConv.personaId) || PERSONAS[0];

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'} w-full max-w-full overflow-hidden`}
                    >
                      {/* Avatar icon */}
                      {!isUser && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-950/80 border border-gray-850 font-sans text-sm select-none shadow">
                          {msgPersona.emoji}
                        </div>
                      )}

                      {/* Content Frame */}
                      <div
                        className={`flex flex-col max-w-[85%] md:max-w-[78%] rounded-2xl p-4.5 shadow-sm border min-w-0 break-words overflow-hidden ${
                          isUser
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-white rounded-tr-none'
                            : 'bg-gray-950/45 border-gray-850/80 text-gray-200 rounded-tl-none'
                        }`}
                      >
                        {/* Meta header information */}
                        <div className="flex items-center justify-between gap-10 mb-2 border-b border-gray-900/40 pb-1.5 text-[11px] font-semibold text-gray-500 select-none uppercase tracking-wider">
                          <span>{isUser ? 'Vous' : `FreeGPT ${msgPersona.name}`}</span>
                          <div className="flex items-center gap-1.5">
                            <span>{msg.timestamp}</span>
                            {msg.type === 'image' && (
                              <span className="rounded bg-indigo-950/60 border border-indigo-900/40 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400">
                                Image
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Speech or error states */}
                        {msg.error ? (
                          <div className="space-y-2 rounded-xl bg-red-950/10 border border-red-900/30 p-3 text-sm text-red-400 font-mono">
                            <p className="font-bold">Erreur de génération :</p>
                            <p className="text-xs leading-normal">{msg.error}</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Render User Attached Image */}
                            {msg.attachedImage && (
                              <div className="overflow-hidden rounded-xl border border-emerald-500/10 bg-gray-950/40 max-w-sm mb-2">
                                <img
                                  src={msg.attachedImage}
                                  alt="Photo attachée"
                                  className="h-auto max-h-48 w-full object-contain"
                                />
                              </div>
                            )}

                            {/* Render Image or Text */}
                            {msg.imageUrl ? (
                              <div className="space-y-3.5">
                                <div className="group relative overflow-hidden rounded-xl border border-gray-850 bg-gray-950 shadow-md">
                                  <img
                                    src={msg.imageUrl}
                                    alt={msg.imagePrompt || 'Visuel généré par FreeGPT'}
                                    className="h-auto max-h-[420px] w-full object-contain transition-transform duration-500 group-hover:scale-[1.01]"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                    <a
                                      href={msg.imageUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-lg bg-gray-900/90 hover:bg-emerald-500 border border-gray-800 p-2 text-white transition-all shadow-lg flex items-center gap-1.5 text-xs font-semibold select-none"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      Ouvrir en grand
                                    </a>
                                  </div>
                                </div>
                                {msg.imagePrompt && (
                                  <div className="rounded-xl border border-gray-900 bg-gray-950/40 p-3 font-mono text-[11px] text-gray-400 tracking-wide leading-relaxed">
                                    <span className="font-bold text-indigo-400 uppercase mr-1 select-none">Prompt artistique :</span>
                                    "{msg.imagePrompt}"
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {/* Render Text Body formatted as Markdown */}
                            {msg.content && <FormattedText content={msg.content} />}
                          </div>
                        )}

                         {/* Bottom action utilities (Read Aloud, Re-generate, etc.) */}
                        {!isUser && !msg.isGenerating && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-900/40 pt-2 text-xs select-none">
                            <button
                              onClick={() => handleReadAloud(msg.content, msg.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                                speakingMessageId === msg.id
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse'
                                  : 'border-gray-850 bg-gray-950/30 text-gray-400 hover:text-white hover:bg-gray-900'
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
                                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-850 bg-gray-950/30 text-gray-400 hover:text-white hover:bg-gray-900 text-[11px] font-semibold transition-all cursor-pointer"
                                title="Copier la réponse en texte"
                              >
                                <Copy className="h-3 w-3" />
                                <span>Copier</span>
                              </button>
                            )}

                            {msg.imageUrl && (
                              <>
                                <button
                                  onClick={() => handleCopyImage(msg.imageUrl!)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-850 bg-gray-950/30 text-gray-400 hover:text-white hover:bg-gray-900 text-[11px] font-semibold transition-all cursor-pointer"
                                  title="Copier la photo"
                                >
                                  <Copy className="h-3 w-3" />
                                  <span>Copier la photo</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setMode('image');
                                    handleSendMessage(msg.imagePrompt, 'image');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-850 bg-gray-950/30 text-gray-400 hover:text-white hover:bg-gray-900 text-[11px] font-semibold transition-all"
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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 font-display text-sm font-bold text-emerald-400 select-none shadow">
                          U
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {/* Animated Loading indicators */}
                {isGeneratingImage && (
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono select-none px-13 animate-pulse-slow">
                    <Palette className="h-3.5 w-3.5 animate-spin" />
                    <span>Création artistique en cours...</span>
                  </div>
                )}

                {isStreaming && (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono select-none px-13 animate-pulse-slow">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                    <span>FreeGPT répond en temps réel...</span>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} className="h-10" />
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
                className="flex flex-wrap items-center justify-between gap-3 bg-indigo-950/35 border border-indigo-900/25 p-3 rounded-xl"
              >
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-300">Format de Photo (Aspect Ratio)</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer ${
                        aspectRatio === ratio
                          ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400'
                          : 'bg-gray-950/40 border-gray-850/50 text-gray-500 hover:text-gray-300'
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
              className="flex flex-col bg-gray-950/80 border border-gray-850/80 rounded-2xl p-2 focus-within:border-emerald-500/40 transition-all shadow-inner"
            >
              {/* Image attachment preview */}
              {attachedImage && (
                <div className="relative inline-block self-start ml-2 mb-2 group">
                  <img
                    src={attachedImage}
                    alt="Attachement"
                    className="h-16 w-16 object-cover rounded-lg border border-gray-800"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachedImage(null)}
                    className="absolute -top-1.5 -right-1.5 bg-gray-900 text-gray-400 hover:text-white rounded-full p-0.5 border border-gray-800 shadow cursor-pointer"
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
                  className="p-2 sm:p-2.5 rounded-xl border border-gray-850 bg-gray-900/30 text-gray-400 hover:text-gray-200 hover:bg-gray-900 transition-all shrink-0 cursor-pointer"
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
                  className={`p-2 sm:p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                    mode === 'image'
                      ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                      : 'border-gray-850 bg-gray-900/30 text-gray-400 hover:text-gray-200 hover:bg-gray-900'
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
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                  placeholder={
                    mode === 'image'
                      ? "Décrivez précisément la photo ou illustration à générer (ex: 'un chat astronaute réaliste')..."
                      : `Discutez avec ${activePersona.name} ou demandez du code...`
                  }
                  className="flex-1 max-h-48 resize-none bg-transparent border-0 py-2.5 px-1.5 text-[14.5px] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-0 leading-relaxed font-sans"
                  disabled={isStreaming || isGeneratingImage}
                />

                {/* Vocal speech mic toggle button */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 sm:p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                    isListening
                      ? 'bg-red-500/15 border-red-500/30 text-red-500 animate-pulse'
                      : 'border-gray-850 bg-gray-900/30 text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                  }`}
                  title="Saisie vocale (Dictée)"
                >
                  <Mic className="h-4.5 w-4.5" />
                </button>

                {/* Submit trigger button */}
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachedImage) || isStreaming || isGeneratingImage}
                  className={`p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                    (!input.trim() && !attachedImage) || isStreaming || isGeneratingImage
                      ? 'bg-gray-900 text-gray-600 border border-gray-850/50 cursor-not-allowed'
                      : mode === 'image'
                      ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow shadow-indigo-950/50 border border-indigo-400/20'
                      : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow shadow-emerald-950/50 border border-emerald-400/20'
                  }`}
                  title="Envoyer la requête"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </div>
            </form>

            <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500 gap-2 px-1 font-sans select-none leading-none text-center sm:text-left">
              <div className="flex items-center gap-1">
                <Info className="h-3 w-3 text-gray-600 shrink-0" />
                <span>Modèle par défaut : Gemini 3.5 & Imagen.</span>
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
