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
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

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

        const promptFinal = `Eres un COACH de alemán B1 para jóvenes. Responde SIEMPRE EN ALEMÁN de forma motivadora. Si hay error añade ---CORRECCION--- con JSON al final. Entrada: ${inputAlumno}`;

        // 1. Generar Texto con Gemini
        const result = await model.generateContent(promptFinal);
        const iaRespuesta = result.response.text();
        
        // 2. LIMPIEZA: Solo enviamos a voz la parte de conversación (sin el JSON de corrección)
        const textoParaVoz = iaRespuesta.split('---CORRECCION---')[0].replace(/[*_#]/g, '');

        // 3. GENERAR AUDIO NATIVO (Usando el modelo de voz de Google)
        // En 2026, Gemini permite generar el audio en la misma llamada o mediante un sub-modelo
        const audioModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const audioResult = await audioModel.generateContent({
            contents: [{ role: "user", parts: [{ text: `Lee esto con voz natural alemana: ${textoParaVoz}` }] }],
            generationConfig: {
                responseMimeType: "audio/mp3", // Formato nativo de Google TTS 2026
            }
        });

        // Extraemos los bytes del audio y los convertimos a Base64
        const audioBase64 = audioResult.response.audioData; 

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ 
            sesionId: sesion._id, 
            iaRespuesta: iaRespuesta, 
            audioContent: audioBase64 // El frontend ya sabe qué hacer con esto
        });

    } catch (error) {
        console.error("Error con voz de Gemini:", error);
        res.status(500).json({ error: error.message });
    }
});
// --- 4. RUTA: FINALIZAR (CON EVALUACIÓN) ---
app.post('/api/practica/finalizar', async (req, res) => {
    const { sesionId } = req.body;

    try {
        await conectarDB();
        const sesion = await SesionPractica.findById(sesionId);

        if (!sesion || sesion.interacciones.length === 0) {
            return res.status(400).json({ error: 'No hay interacciones para evaluar.' });
        }

        const historial = sesion.interacciones.map(i => 
            `Alumno: ${i.alumnoInput}\nIA: ${i.iaRespuesta}`
        ).join('\n\n');

        const promptEvaluacion = `
            Actúa como un examinador senior del Goethe-Zertifikat B1. 
            Analiza la siguiente conversación de práctica oral.
            HISTORIAL:
            ${historial}
            CRITERIOS A EVALUAR:
            - Vocabulario B1, Gramática (weil, obwohl, dass), Interacción.
            RESPONDE ÚNICAMENTE EN FORMATO JSON:
            {
              "puntuacion": (0-100),
              "feedback": "(en español)",
              "nivelDetectado": "(B1.1, B1.2...)",
              "consejo": "(tarea específica)"
            }
        `;

        const result = await model.generateContent(promptEvaluacion);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const evaluacionJSON = JSON.parse(text);

        sesion.estado = 'completada';
        sesion.fechaFin = new Date();
        sesion.evaluacionFinal = evaluacionJSON;
        await sesion.save();

        res.json({ 
            message: 'Evaluación completada', 
            evaluacion: evaluacionJSON 
        });

    } catch (error) {
        console.error('Error al evaluar:', error);
        res.status(500).json({ error: 'Error al generar la evaluación final.' });
    }
});

// --- 5. RUTA: PROFESOR (VER PROGRESO DEL ALUMNO) ---
app.get('/profesor/progreso/:alumnoId', async (req, res) => {
    try {
        await conectarDB();
        const sesiones = await SesionPractica.find({ 
            alumnoId: req.params.alumnoId, 
            estado: 'completada' 
        });
        res.json({
            alumnoId: req.params.alumnoId,
            totalSesiones: sesiones.length,
            sesiones: sesiones
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default app;
