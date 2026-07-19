export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  type?: 'text' | 'image';
  imageUrl?: string;
  imagePrompt?: string;
  isGenerating?: boolean;
  error?: string;
  attachedImage?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  systemInstruction: string;
  temperature: number;
  createdAt: string;
  personaId: string;
}

export interface Persona {
  id: string;
  name: string;
  iconName: string;
  systemInstruction: string;
  description: string;
  emoji: string;
}
