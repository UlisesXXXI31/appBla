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
        let sesion;
        if (sesionId) {
            sesion = await SesionPractica.findById(sesionId);
        }
        if (!sesion) {
            sesion = new SesionPractica({ alumnoId, tema: tema || 'Mi rutina diaria' });
        }

        const prompt = `Eres profesor de alemán B1. Tema: ${sesion.tema}. Alumno: ${inputAlumno}. Responde de forma natural y añade correcciones si es necesario.`;
        const result = await model.generateContent(prompt);
        const iaRespuesta = result.response.text();

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ sesionId: sesion._id, iaRespuesta });
    } catch (error) {
        console.error('Error en /hablar:', error);
        res.status(500).json({ error: error.message });
    }
});

//antes de cerrar la sesión, llamará a Gemini para que analice todo el historial.
app.post('/api/practica/finalizar', async (req, res) => {
    const { sesionId } = req.body;

    try {
        await conectarDB();
        const sesion = await SesionPractica.findById(sesionId);

        if (!sesion || sesion.interacciones.length === 0) {
            return res.status(400).json({ error: 'No hay interacciones para evaluar.' });
        }

        // 1. Preparamos el historial para la IA
        const historial = sesion.interacciones.map(i => 
            `Alumno: ${i.alumnoInput}\nIA: ${i.iaRespuesta}`
        ).join('\n\n');

        // 2. Prompt especializado para el examen Goethe B1
        const promptEvaluacion = `
            Actúa como un examinador senior del Goethe-Zertifikat B1. 
            Analiza la siguiente conversación de práctica oral.
            
            HISTORIAL:
            ${historial}

            CRITERIOS A EVALUAR:
            - Vocabulario (¿Usa palabras de nivel B1?).
            - Estructura gramatical (¿Usa conectores como 'weil', 'obwohl', 'dass'?).
            - Capacidad de interacción (¿Responde de forma lógica o repite palabras?).

            RESPONDE ÚNICAMENTE EN FORMATO JSON (sin texto extra):
            {
              "puntuacion": (número del 0 al 100),
              "feedback": "(breve resumen pedagógico en español)",
              "nivelDetectado": "(ejemplo: B1.1, B1.2 o A2 si es muy bajo)",
              "consejo": "(una tarea específica para mejorar)"
            }
        `;

        // 3. Llamada a Gemini para la nota final
        const result = await model.generateContent(promptEvaluacion);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const evaluacionJSON = JSON.parse(text);

        // 4. Guardamos todo y cerramos sesión
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
