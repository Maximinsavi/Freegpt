import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI with server-side API Key lazily to handle missing key errors gracefully
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

// Middlewares
app.use(express.json({ limit: '10mb' }));

// Health Check Endpoint
app.get(["/api", "/api/health"], (req, res) => {
  res.json({ status: "ok", service: "FreeGPT Local Backend" });
});

// API: Chat Completion (SSE Streaming)
app.post(["/api/chat", "/chat"], async (req, res) => {
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
    // Map history to roles supporting text and image modalities
    const contents = messages.map((m: any) => {
      const parts: any[] = [];
      
      if (m.content) {
        parts.push({ text: m.content });
      }

      if (m.attachedImage) {
        const matches = m.attachedImage.match(/^data:([^;]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const data = matches[2];
          parts.push({
            inlineData: {
              data,
              mimeType
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
    console.error("Gemini Chat API Error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message || "Une erreur est survenue lors de la génération de texte." })}\n\n`);
    res.end();
  }
});

// API: Image Generation (Gemini-Enhanced Flux Engine)
app.post(["/api/generate-image", "/generate-image"], async (req, res) => {
  const { prompt, aspectRatio } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ success: false, error: "Le prompt est requis." });
  }

  // Calculate dimensions for generator based on aspect ratio
  let width = 1024;
  let height = 1024;
  if (aspectRatio === "16:9") {
    width = 1024;
    height = 576;
  } else if (aspectRatio === "9:16") {
    width = 576;
    height = 1024;
  } else if (aspectRatio === "4:3") {
    width = 1024;
    height = 768;
  } else if (aspectRatio === "3:4") {
    width = 768;
    height = 1024;
  }

  // 1. Enrich the prompt using Gemini 3.5-flash for photorealism and English translation optimization
  let enrichedPrompt = prompt;
  try {
    console.log(`Enriching/translating image prompt with Gemini: "${prompt}"`);
    const aiClient = getGeminiClient();
    const enrichResponse = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an expert AI image prompt engineer. 
Translate the following prompt to English if it is in French, and enrich it by adding highly vivid visual details, descriptive artistic textures, beautiful volumetric cinematic lighting, photorealism elements, or matching artistic styles. 
Ensure the prompt is cohesive and describes a masterpiece. Do not add warnings, and do not put it in quotes.
Keep the output short (under 70 words) and reply with ONLY the final English prompt.

User Prompt: "${prompt}"`
    });

    if (enrichResponse.text) {
      enrichedPrompt = enrichResponse.text.trim().replace(/^"|"$/g, "");
      console.log(`Enriched prompt: "${enrichedPrompt}"`);
    }
  } catch (enrichErr) {
    console.warn("Failed to enrich prompt, using raw user prompt:", enrichErr);
  }

  // 2. Generate the high-quality image using the state-of-the-art Flux engine on Pollinations
  try {
    const seed = Math.floor(Math.random() * 100000000);
    // Use the legendary 'flux' model for gorgeous photorealism, detailed textures, and perfect text rendering
    const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true&model=flux`;
    
    console.log(`Fetching Flux image from Pollinations: ${fluxUrl}`);
    const imageRes = await fetch(fluxUrl);
    if (!imageRes.ok) {
      throw new Error(`Le générateur Flux a renvoyé le statut ${imageRes.status}`);
    }

    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64}`;

    console.log("Flux image generated and converted successfully.");
    return res.json({
      success: true,
      imageUrl,
      description: `Généré par FreeGPT Flux Engine ✨\n\n*Prompt optimisé : "${enrichedPrompt}"*`
    });
  } catch (err: any) {
    console.error("Flux generation failed, falling back to basic Pollinations engine:", err);
    try {
      const seed = Math.floor(Math.random() * 10000000);
      const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true&enhance=false`;
      
      const imageRes = await fetch(fallbackUrl);
      if (!imageRes.ok) {
        throw new Error(`Le générateur de secours a renvoyé le statut ${imageRes.status}`);
      }

      const buffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const imageUrl = `data:image/jpeg;base64,${base64}`;

      return res.json({
        success: true,
        imageUrl,
        description: "Généré avec succès via le moteur de secours."
      });
    } catch (fallbackErr: any) {
      console.error("All image generation engines failed:", fallbackErr);
      return res.status(500).json({
        success: false,
        error: "Impossible de générer l'image. Le serveur de génération de photos est actuellement surchargé. Veuillez réessayer dans quelques instants."
      });
    }
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
