import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, aspectRatio } = req.body;
  if (!prompt) {
    return res.status(400).json({ success: false, error: "Le prompt est requis." });
  }

  // Calculate dimensions based on aspect ratio
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

  // Optimize prompt with Gemini
  let enrichedPrompt = prompt;
  try {
    const enrichResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `You are an expert AI image prompt engineer. Translate the following prompt to English if it is in French, and enrich it by adding highly vivid visual details, descriptive artistic textures, beautiful volumetric cinematic lighting, photorealism elements, or matching artistic styles. Keep the output short (under 70 words) and reply with ONLY the final English prompt.\n\nUser Prompt: "${prompt}"`
    });
    if (enrichResponse.text) {
      enrichedPrompt = enrichResponse.text.trim().replace(/^"|"$/g, "");
    }
  } catch (err) {
    console.warn("Failed to enrich prompt, using raw prompt:", err);
  }

  // Call Pollinations Flux generator
  try {
    const seed = Math.floor(Math.random() * 100000000);
    const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true&model=flux`;
    
    const imageRes = await fetch(fluxUrl);
    if (!imageRes.ok) {
      throw new Error(`Flux generator status: ${imageRes.status}`);
    }

    const buffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64}`;

    return res.json({
      success: true,
      imageUrl,
      description: `Généré par FreeGPT Flux Engine ✨\n\n*Prompt optimisé : "${enrichedPrompt}"*`
    });
  } catch (err) {
    console.error("Flux generation failed, using fallback:", err);
    try {
      const seed = Math.floor(Math.random() * 10000000);
      const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true&private=true&enhance=false`;
      
      const imageRes = await fetch(fallbackUrl);
      if (!imageRes.ok) {
        throw new Error(`Fallback failed`);
      }

      const buffer = await imageRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const imageUrl = `data:image/jpeg;base64,${base64}`;

      return res.json({
        success: true,
        imageUrl,
        description: "Généré via le moteur de secours."
      });
    } catch (fallbackErr: any) {
      return res.status(500).json({
        success: false,
        error: "Surcharge du serveur d'images. Réessayez."
      });
    }
  }
}
