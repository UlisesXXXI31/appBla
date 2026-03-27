import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import SesionPractica from '../models/SesionPractica.js';

const app = express();
app.use(cors());
app.use(express.json());

const conectarDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(process.env.MONGODB_URI);
};

// Inicializamos clientes usando TUS variables de la captura
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Ajustado a 'ELEVENLABS_API' como sale en tu captura
const elevenlabs = new ElevenLabsClient({ 
    apiKey: process.env.ELEVENLABS_API 
});

app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    try {
        await conectarDB();
        let sesion = sesionId ? await SesionPractica.findById(sesionId) : new SesionPractica({ alumnoId, tema });

        // 1. Generar texto con Gemini
        const promptFinal = `Eres un COACH de alemán B1 para jóvenes. Responde 100% EN ALEMÁN de forma motivadora. Usa 'du'. No uses emojis ni asteriscos en la conversación. Alumno dice: ${inputAlumno}`;
        const result = await model.generateContent(promptFinal);
        const iaRespuesta = result.response.text();

        // 2. Generar Audio con ElevenLabs (SDK)
        let audioBase64 = null;
        try {
            const audioStream = await elevenlabs.textToSpeech.convert(
                process.env.ELEVENLABS_VOICE_ID, // Usa tu variable de Vercel
                {
                    text: iaRespuesta,
                    model_id: "eleven_multilingual_v2",
                    output_format: "mp3_44100_128",
                }
            );

            // Convertir stream a Base64 para enviarlo al móvil
            const chunks = [];
            for await (const chunk of audioStream) {
                chunks.push(chunk);
            }
            const audioBuffer = Buffer.concat(chunks);
            audioBase64 = audioBuffer.toString('base64');
        } catch (e) {
            console.error("Error en ElevenLabs:", e.message);
        }

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ 
            sesionId: sesion._id, 
            iaRespuesta: iaRespuesta, 
            audioContent: audioBase64 
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default app;
