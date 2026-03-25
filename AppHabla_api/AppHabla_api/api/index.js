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
 // --- DINÁMICA DE PERSONA SEGÚN EL TEMA ---
        let instruccionesRol = "";
        const temaActual = sesion.tema;

        if (temaActual.startsWith('p1_')) {
            // Modo Planificación (Teil 1 Goethe)
            instruccionesRol = `
                Actúa como el COMPAÑERO DE CLASE y AMIGO del alumno. 
                Vais a organizar juntos una actividad (ID de tema: ${temaActual}). 
                Debes proponer ideas, negociar y ser entusiasta.`;
        } else if (temaActual.startsWith('p2_')) {
            // Modo Presentación (Teil 2 & 3 Goethe)
            instruccionesRol = `
                Actúa como un EXAMINADOR JOVEN Y CERCANO. 
                Escucha la presentación del alumno sobre el tema: ${temaActual}. 
                Hazle una pregunta interesante sobre su opinión o vida diaria para generar debate.`;
        } else {
            // Modo Charla General
            instruccionesRol = `
                Actúa como un AMIGO del alumno charlando en el recreo. 
                El tema es: "${temaActual}". Haz que la conversación sea divertida y relajada.`;
        }

        // --- CONSTRUCCIÓN DEL PROMPT FINAL ---
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

        // Llamada a Gemini
        const result = await model.generateContent(promptFinal);
        const iaRespuesta = result.response.text();

        // Guardamos la interacción
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
