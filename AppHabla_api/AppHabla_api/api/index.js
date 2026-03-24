import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import SesionPractica from '../models/SesionPractica.js';

const app = express();
app.use(cors());
app.use(express.json());

// --- LÓGICA DE CONEXIÓN ROBUSTA PARA VERCEL ---
let isConnected = false;

const conectarDB = async () => {
    if (isConnected) return;

    try {
        // Forzamos la espera de la conexión
        const db = await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Falla rápido si no conecta
        });
        isConnected = db.connections[0].readyState === 1;
        console.log('✅ Conectado a MongoDB');
    } catch (err) {
        console.error('❌ Error crítico MongoDB:', err.message);
        throw err;
    }
};

// --- CONFIGURACIÓN DE GEMINI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Usamos gemini-1.5-flash-latest que suele ser el más estable para evitar el 404
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

app.get('/', (req, res) => {
    res.json({ mensaje: "API Activa 🚀", dbStatus: isConnected ? "Conectado" : "Desconectado" });
});

app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;

    try {
        // 1. Asegurar conexión a DB antes de cualquier operación
        await conectarDB();

        // 2. Buscar o crear sesión
        let sesion;
        if (sesionId) {
            sesion = await SesionPractica.findById(sesionId);
        }
        if (!sesion) {
            sesion = new SesionPractica({ alumnoId, tema: tema || 'Mi rutina diaria' });
        }

        const prompt = `Eres profesor de alemán B1. Tema: ${sesion.tema}. Alumno: ${inputAlumno}. Responde y si hay error añade ---CORRECCION--- con JSON.`;

        // 3. Llamar a Gemini
        const result = await model.generateContent(prompt);
        const fullText = result.response.text();

        let iaRespuesta = fullText;
        let correccionData = null;

        if (fullText.includes('---CORRECCION---')) {
            const parts = fullText.split('---CORRECCION---');
            iaRespuesta = parts[0].trim();
            try {
                const jsonStr = parts[1].trim().replace(/```json|```/g, "");
                correccionData = JSON.parse(jsonStr);
            } catch (e) { console.error("Error JSON:", e); }
        }

        // 4. Guardar en DB
        sesion.interacciones.push({ alumnoInput: inputAlumno, iaRespuesta, correccion: correccionData });
        await sesion.save();

        res.json({ sesionId: sesion._id, iaRespuesta, correccion: correccionData });

    } catch (error) {
        console.error('Error en /hablar:', error);
        res.status(500).json({ error: error.message });
    }
});

export default app;
