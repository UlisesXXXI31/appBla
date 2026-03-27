import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import SesionPractica from '../models/SesionPractica.js';

const app = express();
app.use(cors());
app.use(express.json());

let isConnected = false;

// --- 1. FUNCIÓN DE CONEXIÓN A DB ---
const conectarDB = async () => {
    if (mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        isConnected = true;
        console.log('✅ Conectado a MongoDB');
    } catch (err) {
        isConnected = false;
        console.error('❌ Error MongoDB:', err.message);
    }
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// --- 2. RUTA DE INICIO (HEALTH CHECK) ---
app.get('/', async (req, res) => {
    await conectarDB();
    res.json({ 
        mensaje: "API Activa 🚀", 
        dbStatus: isConnected ? "Conectado ✅" : "Desconectado ❌" 
    });
});

// --- 3. RUTA: HABLAR (EL ALUMNO HABLA CON LA IA) ---
app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    try {
        await conectarDB();
        let sesion = sesionId ? await SesionPractica.findById(sesionId) : new SesionPractica({ alumnoId, tema });

        // Prompt estricto para adolescentes y B1
        const promptFinal = `
            Eres un COACH de alemán B1 para jóvenes. 
            REGLAS: 
            1. Responde 100% EN ALEMÁN. Tutéame (usando 'du'). 
            2. Sé súper motivador y divertido.
            3. Si hay un error, añade al final ---CORRECCION--- seguido de un JSON.
            Entrada del alumno: "${inputAlumno}"
        `;

        // Generamos el texto
        const result = await model.generateContent(promptFinal);
        const iaRespuesta = result.response.text();

        // --- GENERACIÓN DE AUDIO NATIVO (Gemini TTS) ---
        // Limpiamos el texto para que el audio no lea el JSON de corrección
        const textoLimpio = iaRespuesta.split('---CORRECCION---')[0].replace(/[*_#]/g, '');
        
        // En 2026 pedimos a Gemini que convierta ese texto a audio directamente
        const audioResult = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: `Sprich das mit einer natürlichen, motivierenden Stimme aus: ${textoLimpio}` }] }],
            generationConfig: { responseMimeType: "audio/mp3" }
        });

        // Extraemos los datos de audio en base64
        const audioBase64 = audioResult.response.audioData || null;

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ 
            sesionId: sesion._id, 
            iaRespuesta: iaRespuesta, 
            audioContent: audioBase64 
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. RUTA FINALIZAR (EVALUACIÓN)
app.post('/api/practica/finalizar', async (req, res) => {
    const { sesionId } = req.body;
    try {
        await conectarDB();
        const sesion = await SesionPractica.findById(sesionId);
        if (!sesion) return res.status(404).json({ error: "No existe" });

        const h = sesion.interacciones.map(i => `A: ${i.alumnoInput}\nIA: ${i.iaRespuesta}`).join('\n');
        const p = `Actúa como examinador Goethe B1. Evalúa este chat y responde SOLO JSON: {"puntuacion": 85, "feedback": "Excelente uso de conectores", "nivelDetectado": "B1.2", "consejo": "Sigue así"}. Historial: ${h}`;

        const result = await model.generateContent(p);
        const evalText = result.response.text().replace(/```json|```/g, "").trim();
        
        sesion.estado = "completada";
        sesion.evaluacionFinal = JSON.parse(evalText);
        await sesion.save();

        res.json({ evaluacion: sesion.evaluacionFinal });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default app;
