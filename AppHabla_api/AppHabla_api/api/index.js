import 'dotenv/config'; 
import express from 'express';
import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';
import SesionPractica from '../models/SesionPractica.js'; // Ajustado si index.js está en /api
import cors from 'cors';

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json()); 

// --- 🚀 NUEVA RUTA BASE (Para evitar el Cannot GET /) ---
app.get('/', (req, res) => {
    res.json({ 
        estado: "Conectado", 
        mensaje: "API de Práctica de Alemán activa 🚀",
        endpoints: ["/api/practica/hablar", "/api/practica/finalizar", "/profesor/progreso/:id"]
    });
});

// --- Conexión a MongoDB ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => {
        console.error('❌ Error MongoDB:', err.message);
    });

// --- Inicialización de Gemini ---
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);
const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" }); // Nota: gemini-1.5-flash es el estándar actual

// --- Endpoints ---

// Endpoint 1: Hablar
app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    if (!alumnoId || !inputAlumno) return res.status(400).send({ error: "Faltan datos." });

    try {
        let sesion = sesionId ? await SesionPractica.findById(sesionId) : null;
        if (!sesion) {
            sesion = new SesionPractica({ alumnoId, tema: tema || 'Mi rutina diaria' }); 
            await sesion.save();
        }
        
        const systemPrompt = `Eres profesor de alemán B1. Tema: ${sesion.tema}. Responde al alumno: ${inputAlumno}. Si hay error, añade ---CORRECCION--- seguido de un JSON.`;

        const result = await model.generateContent(systemPrompt);
        const fullText = result.response.text();
        
        let iaRespuesta = fullText;
        let correccionData = null;
        
        if (fullText.includes('---CORRECCION---')) {
            const parts = fullText.split('---CORRECCION---');
            iaRespuesta = parts[0].trim();
            try { correccionData = JSON.parse(parts[1].trim()); } catch (e) {}
        }
        
        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta, correccion: correccionData });
        await sesion.save();
        
        res.json({ sesionId: sesion._id, iaRespuesta });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Endpoint 2: Finalizar
app.post('/api/practica/finalizar', async (req, res) => {
    try {
        const sesion = await SesionPractica.findByIdAndUpdate(
            req.body.sesionId,
            { fechaFin: new Date(), estado: 'completada' },
            { new: true }
        );
        res.json({ message: 'Finalizada', sesion });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Endpoint 3: Profesor
app.get('/profesor/progreso/:alumnoId', async (req, res) => {
    try {
        const sesiones = await SesionPractica.find({ alumnoId: req.params.alumnoId, estado: 'completada' });
        res.json({ total: sesiones.length, sesiones });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

// Exportación para Vercel
export default app;
