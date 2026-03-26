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

        // PROMPT MOTIVADOR (Personalidad de Coach)
        const prompt = `Eres el mejor COACH de alemán para adolescentes. 
        Tu tono es súper motivador, divertido y cercano. Usa siempre 'du'.
        Tema: ${sesion.tema}. Alumno: ${inputAlumno}.
        REGLA: Responde animando mucho al alumno ("¡Genial!", "¡Sigue así!"). 
        Si hay error, añade al final ---CORRECCION--- con el JSON.`;

        const result = await model.generateContent(prompt);
        const iaRespuesta = result.response.text();

        // --- 🎙️ CONEXIÓN CON ELEVENLABS ---
        // Limpiamos el texto de asteriscos y emojis para que la voz no haga ruidos raros
        const textoParaVoz = iaRespuesta.split('---CORRECCION---')[0].replace(/[*_#]/g, '');

        const responseAudio = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
            text: textoParaVoz,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
    });

    if (!responseAudio.ok) {
        const errorData = await responseAudio.json();
        console.error("Error de ElevenLabs:", errorData);
        // Si falla ElevenLabs, enviamos el texto solo para no bloquear la app
        return res.json({ sesionId: sesion._id, iaRespuesta, audioContent: null });
    }

    const audioBuffer = await responseAudio.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
    await sesion.save();

    res.json({ 
        sesionId: sesion._id, 
        iaRespuesta: iaRespuesta, 
        audioContent: audioBase64 
    });

} catch (error) {
    console.error("Error general:", error);
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
