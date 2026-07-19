import { GoogleGenAI } from "@google/genai";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error("Clé API Gemini manquante. Veuillez configurer votre clé API dans Google AI Studio via le menu Paramètres > Secrets (Settings > Secrets) pour activer les fonctionnalités d'IA.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, systemInstruction, temperature } = req.body;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  try {
    const contents = messages.map((m: any) => {
      const parts: any[] = [];
      
      if (m.content) {
        parts.push({ text: m.content });
      }

      if (m.attachedImage) {
        const matches = m.attachedImage.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          parts.push({
            inlineData: {
              data: matches[2],
              mimeType: matches[1]
            }
          });
        }
      }

      if (parts.length === 0) {
        parts.push({ text: "" });
      }

      return {
        role: m.role === "user" ? "user" : "model",
        parts
      };
    });

    const aiClient = getGeminiClient();
    const responseStream = await aiClient.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction: systemInstruction || "You are a helpful AI assistant called FreeGPT.",
        temperature: temperature !== undefined ? Number(temperature) : 0.7,
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    console.error("Vercel Chat API Error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message || "Une erreur est survenue lors de la génération." })}\n\n`);
    res.end();
  }
}
