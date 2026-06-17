import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Increase request size limits for base64 files
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini SDK helper
// User-Agent must be 'aistudio-build'
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please add it in Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Helper function to call async operations with retry backoff for transient 503/429 errors
async function callWithRetry<T>(fn: () => Promise<T>, retries = 5, initialDelay = 1500): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      
      const errorMessage = (error?.message || error?.statusText || "").toString();
      const errorCode = error?.status || error?.code || 0;
      
      const isTransient = 
        errorCode === 503 || 
        errorCode === 429 ||
        errorCode === 408 ||
        errorMessage.includes("503") ||
        errorMessage.includes("429") ||
        errorMessage.includes("high demand") ||
        errorMessage.includes("temporary") ||
        errorMessage.includes("UNAVAILABLE") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("Service Unavailable") ||
        errorMessage.includes("Resource has been exhausted");

      if (isTransient && attempt < retries) {
        const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 500;
        console.warn(`[Gemini API] TRANSIENT ERROR (${errorCode || 'NoCode'}: ${errorMessage}). Attempt ${attempt}/${retries}. Retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Erro de conexão persistente com a API (limite de tentativas excedido - 503/429). Por favor, tente novamente em instantes.");
}

// Simple Healthcheck API
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// API endpoint to generate Study Guide and Podcast Script
app.post("/api/study/generate", async (req, res) => {
  try {
    const { topicText, fileBase64, fileMimeType, podcastStyle } = req.body;
    
    if (!topicText && !fileBase64) {
      return res.status(400).json({ error: "É necessário fornecer um assunto por texto ou fazer upload de um documento/imagem." });
    }

    const ai = getGeminiClient();

    // Prepare contents parts
    const parts: any[] = [];

    // Add file context if present
    if (fileBase64 && fileMimeType) {
      parts.push({
        inlineData: {
          mimeType: fileMimeType,
          data: fileBase64
        }
      });
    }

    // Prepare a clear instruction prompt based on the style
    const styleInstructions = {
      fun: "humorístico, descontraído, com analogias divertidas e piadinhas leves de estudante.",
      academic: "mais didático, formal, focado em explicar conceitos e definições precisas de forma clara.",
      interview: "no formato de entrevista de rádio, onde Lucas entrevista a especialista Mariana com curiosidades práticas."
    };

    const selectedStyle = styleInstructions[podcastStyle as keyof typeof styleInstructions] || styleInstructions.fun;

    const systemInstruction = 
      "Você é o tutor especialista do 'Go book', uma inteligência artificial criada para ajudar estudantes a compreender qualquer matéria da forma mais simples possível.\n" +
      "Sua missão é extrair e organizar o conhecimento do tema/arquivo enviado, gerando um ótimo material em PDF e um roteiro de podcast.\n" +
      "As respostas devem vir rigorosamente em formato JSON, respeitando o esquema fornecido.";

    const userPrompt = 
      `Analise o material fornecido (que pode conter texto, imagem de lousa/quadro ou um PDF) e o seguinte tópico solicitado pelo aluno: "${topicText || "Explicar o arquivo fornecido"}".\n\n` +
      `Gere um guia de estudos completo e estruturado, além de um roteiro bem longo e detalhado de podcast de debate em português.\n\n` +
      `REQUISITOS DO GUIA DE ESTUDOS (contentMarkdown):\n` +
      `- Use formatação Markdown rica e bonita.\n` +
      `- Divida em seções claras: Introdução Simplificada, Conceitos-Chave (com marcadores), Exemplos Práticos ou Analogias do Dia-a-Dia, e um Quiz Rápido com 3 perguntas e respostas rápidas no final.\n\n` +
      `REQUISITOS DO ROTEIRO DE PODCAST (podcastScript):\n` +
      `- O podcast deve ser um debate animado, rico e educativo entre duas pessoas: Lucas e Mariana.\n` +
      `- Lucas: Um estudante curioso, entusiasmado, que faz perguntas práticas do tipo "para que serve isso no mundo real?" e expressa espanto com fatos interessantes.\n` +
      `- Mariana: Uma tutora genial, paciente e carismática, que usa analogias incríveis para explicar tudo de maneira simples.\n` +
      `- Tom do podcast: ${selectedStyle}\n` +
      `- Tamanho: Deve ser um debate longo e aprofundado, com no mínimo 20 a 30 falas alternadas no total. Cada fala deve conter explicações detalhadas de 3 a 6 frases completas e explicativas (nada de falas monossilábicas ou vazias, queremos conteúdo de alta densidade didática para somar cerca de 5 minutos de conversa falada).\n` +
      `- O roteiro deve começar com uma calorosa saudação e introdução do tema ao ouvinte do Go book, e terminar com um fechamento inspirador, incentivando a continuidade dos estudos.`;

    parts.push({ text: userPrompt });

    const response = await callWithRetry(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Um título curto, impactante e convidativo para o assunto de estudo."
            },
            summary: {
              type: Type.STRING,
              description: "Um resumo executivo curto de 2 a 3 linhas explicando o que será aprendido."
            },
            contentMarkdown: {
              type: Type.STRING,
              description: "A explicação detalhada da matéria, formatada em Markdown com cabeçalhos (#, ##), listas e tabelas se necessário."
            },
            podcastScript: {
              type: Type.ARRAY,
              description: "Lista substancial e longa de falas do roteiro do podcast.",
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: {
                    type: Type.STRING,
                    description: "Nome do personagem que fala: obrigatoriamente 'Lucas' ou 'Mariana'."
                  },
                  text: {
                    type: Type.STRING,
                    description: "Linha de diálogo dita pelo personagem em português, contendo de 3 a 5 frases ricas, explicativas e com conteúdo denso."
                  }
                },
                required: ["speaker", "text"]
              }
            }
          },
          required: ["title", "summary", "contentMarkdown", "podcastScript"]
        }
      }
    }));

    const resultText = response.text;
    if (!resultText) {
      throw new Error("O modelo gerou um resultado vazio.");
    }

    const data = JSON.parse(resultText.trim());
    res.json(data);

  } catch (error: any) {
    console.error("Erro na rota /api/study/generate:", error);
    res.status(500).json({ error: error.message || "Erro interno ao gerar o material de estudo." });
  }
});

// Helper function to prepend a WAV header to raw PCM buffer for 24kHz 16-bit Mono
function pcmToWav(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  const header = Buffer.alloc(44);
  const dataLength = pcmBuffer.length;
  const fileLength = dataLength + 36;

  // RIFF identifier
  header.write("RIFF", 0);
  header.writeUInt32LE(fileLength, 4);
  // WAVE identifier
  header.write("WAVE", 8);
  // FMT sub-chunk identifier
  header.write("fmt ", 12);
  // Sub-chunk size (16 for PCM)
  header.writeUInt32LE(16, 16);
  // Audio format (1 for PCM)
  header.writeUInt16LE(1, 20);
  // Number of channels (1 for Mono)
  header.writeUInt16LE(1, 22);
  // Sample rate (24000)
  header.writeUInt32LE(sampleRate, 24);
  // Byte rate (sampleRate * blockAlign, where blockAlign = channels * bytesPerSample = 1 * 2 = 2)
  header.writeUInt32LE(sampleRate * 2, 28);
  // Block align (channels * bytesPerSample = 2)
  header.writeUInt16LE(2, 32);
  // Bits per sample (16 bits)
  header.writeUInt16LE(16, 34);
  // Data sub-chunk identifier
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// API endpoint to generate Multi-speaker Podcast Audiobook using gemini-3.1-flash-tts-preview
app.post("/api/study/podcast", async (req, res) => {
  try {
    const { podcastScript } = req.body;

    if (!podcastScript || !Array.isArray(podcastScript)) {
      return res.status(400).json({ error: "Script do podcast inválido ou ausente." });
    }

    const ai = getGeminiClient();

    // Group the dialogues into smaller chunks (of size 3 lines) to stay safely within TTS limits.
    // This supports arbitrary-length podcasts (e.g., 5+ minutes total, up to 30 dialogues) flawlessly.
    const chunkSize = 3;
    const chunks: any[][] = [];
    for (let i = 0; i < podcastScript.length; i += chunkSize) {
      chunks.push(podcastScript.slice(i, i + chunkSize));
    }

    console.log(`[Go book] Split podcast into ${chunks.length} segments for robust compilation.`);

    const pcmBuffers: Buffer[] = [];

    // Process chunk by chunk to gather all voices, with exponential backoff for high resilience.
    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      const chunkDialogue = chunk
        .map((lineObject: any) => `${lineObject.speaker}: ${lineObject.text}`)
        .join("\n\n");

      const ttsPrompt = 
        `TTS the following segment of an educational podcast conversation between Lucas and Mariana. ` +
        `Make sure the audio voices match the characters perfectly:\n\n${chunkDialogue}`;

      console.log(`[Go book] Compiling audio chunk ${c + 1}/${chunks.length}...`);

      const response = await callWithRetry(() => ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: ttsPrompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: "Lucas",
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Zephyr" }
                  }
                },
                {
                  speaker: "Mariana",
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Kore" }
                  }
                }
              ]
            }
          }
        }
      }));

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        console.warn(`[Go book] WARNING: Audio part ${c + 1}/${chunks.length} did not return audio.`);
        continue;
      }

      const pcmBuffer = Buffer.from(base64Audio, "base64");
      pcmBuffers.push(pcmBuffer);
    }

    if (pcmBuffers.length === 0) {
      throw new Error("Não foi possível coletar faixas de voz válidas do modelo de áudio.");
    }

    // Concatenate all sound byte buffers together natively
    const combinedPcm = Buffer.concat(pcmBuffers);
    
    // Construct single WAV wrapper header
    const wavBuffer = pcmToWav(combinedPcm, 24000);

    // Return the audio as WAV format directly
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", "attachment; filename=podcast.wav");
    res.send(wavBuffer);

  } catch (error: any) {
    console.error("Erro na rota /api/study/podcast:", error);
    res.status(500).json({ error: error.message || "Erro ao gerar o áudio do podcast." });
  }
});

// Configure Vite or Static server
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Go book] Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
