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

        // --- DINÁMICA DE PERSONA SEGÚN EL TEMA ---
        let instruccionesRol = "";
        const temaActual = sesion.tema;

        if (temaActual.startsWith('p1_')) {
            instruccionesRol = `
                Actúa como el COMPAÑERO DE CLASE y AMIGO del alumno. 
                Vais a organizar juntos una actividad (ID de tema: ${temaActual}). 
                Debes proponer ideas, negociar y ser entusiasta.`;
        } else if (temaActual.startsWith('p2_')) {
            instruccionesRol = `
                Actúa como un EXAMINADOR JOVEN Y CERCANO. 
                Escucha la presentación del alumno sobre el tema: ${temaActual}. 
                Hazle una pregunta interesante sobre su opinión o vida diaria para generar debate.`;
        } else {
            instruccionesRol = `
                Actúa como un AMIGO del alumno charlando en el recreo. 
                El tema es: "${temaActual}". Haz que la conversación sea divertida y relajada.`;
        }

        const promptFinal = `
            Eres un tutor de alemán experto para ADOLESCENTES que se preparan para el B1.
            Tu tono es motivador, paciente y moderno.

            REGLAS CRÍTICAS:
            1. USA SIEMPRE EL TRATO DE 'DU' (tutear). Prohibido usar 'Sie'.
            2. NIVEL: Alemán B1 claro y natural.
            3. ROL ESPECÍFICO: ${instruccionesRol}
            
            FORMATO DE RESPUESTA:
            Responde de forma fluida. Si detectas un error gramatical o de vocabulario importante, 
            mantén la charla pero añade al final de tu respuesta:
            ---CORRECCION--- {"fraseOriginal": "...", "tipoError": "...", "fraseCorregida": "..."}

            Entrada del alumno: "${inputAlumno}"
        `;

        const result = await model.generateContent(promptFinal);
        const iaRespuesta = result.response.text();

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ sesionId: sesion._id, iaRespuesta });
    } catch (error) {
        console.error('Error en /hablar:', error);
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
