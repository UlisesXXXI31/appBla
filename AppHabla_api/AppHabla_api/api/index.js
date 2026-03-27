import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import SesionPractica from '../models/SesionPractica.js';

const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXIÓN A MONGODB (Optimizada para Vercel) ---
let isConnected = false;
const conectarDB = async () => {
    if (mongoose.connection.readyState === 1) {
        isConnected = true;
        return;
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log('✅ Conectado a MongoDB');
    } catch (err) {
        isConnected = false;
        console.error('❌ Error MongoDB:', err.message);
    }
};

// --- CONFIGURACIÓN DE GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

// --- RUTA 1: ESTADO (Para probar que todo funciona) ---
app.get('/', async (req, res) => {
    await conectarDB();
    res.json({ 
        mensaje: "API de Alemán Activa 🚀", 
        db: isConnected ? "Conectada" : "Error de conexión" 
    });
});

// --- RUTA 2: HABLAR (El Coach de Alemán) ---
app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    
    try {
        await conectarDB();
        let sesion = sesionId ? await SesionPractica.findById(sesionId) : null;
        if (!sesion) {
            sesion = new SesionPractica({ alumnoId, tema: tema || 'General' });
        }

        const temaActual = sesion.tema || "General";
        let instruccionesRol = "";

        // Lógica de rol para B1 Goethe
        if (temaActual.startsWith('p1_')) {
            instruccionesRol = "MODO: EXAMEN B1 - TEIL 1. Actúa como mi compañero de clase. Planificamos algo juntos.";
        } else if (temaActual.startsWith('p2_')) {
            instruccionesRol = "MODO: EXAMEN B1 - TEIL 2. Eres el examinador. Escucha mi presentación y hazme una pregunta crítica.";
        } else {
            instruccionesRol = "MODO: AMIGO. Charla relajada sobre el tema.";
        }

        const promptFinal = `
            Eres un COACH de alemán B1 para jóvenes adolescentes.
            REGLAS DE ORO:
            1. Responde 100% EN ALEMÁN.
            2. Usa siempre 'du' (tutear). Sé muy motivador y divertido.
            3. ROL: ${instruccionesRol}
            4. Si el alumno comete un error gramatical, añade al final: ---CORRECCION--- seguido de un JSON con fraseOriginal y fraseCorregida.
            
            Tema: ${temaActual}
            Alumno dice: "${inputAlumno}"
        `;

        const result = await model.generateContent(promptFinal);
        const iaRespuesta = result.response.text();

        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta });
        await sesion.save();

        res.json({ sesionId: sesion._id, iaRespuesta });
    } catch (error) {
        console.error("Error en hablar:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- RUTA 3: FINALIZAR (Evaluación Goethe B1) ---
app.post('/api/practica/finalizar', async (req, res) => {
    const { sesionId } = req.body;
    try {
        await conectarDB();
        const sesion = await SesionPractica.findById(sesionId);
        if (!sesion) return res.status(404).json({ error: "Sesión no encontrada" });

        const h = sesion.interacciones.map(i => `A: ${i.alumnoInput}\nIA: ${i.iaRespuesta}`).join('\n');
        const p = `Actúa como examinador del Goethe Institut B1. Evalúa esta charla (0-100) y responde SOLO un JSON con: 
        puntuacion, feedback (en español), nivelDetectado (A2 a B1.2) y consejo. Historial:\n${h}`;

        const result = await model.generateContent(p);
        const evalText = result.response.text().replace(/```json|```/g, "").trim();
        
        sesion.estado = 'completada';
        sesion.evaluacionFinal = JSON.parse(evalText);
        await sesion.save();

        res.json({ evaluacion: sesion.evaluacionFinal });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default app;
