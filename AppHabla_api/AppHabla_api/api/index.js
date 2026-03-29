import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import SesionPractica from '../models/SesionPractica.js';

const app = express();
app.use(cors());
app.use(express.json());

// --- CONEXIÓN A MONGODB ---
const conectarDB = async () => {
    if (mongoose.connection.readyState === 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Conectado');
    } catch (err) {
        console.error('❌ Error DB:', err.message);
    }
};

// --- RUTA 1: CONECTAR (Envía el ID del Agente al Frontend) ---
app.get('/api/practica/conectar', (req, res) => {
    // Simplemente enviamos el ID que tienes en tus variables de Vercel
    res.json({ 
        agentId: process.env.ELEVENLABS_AGENT_ID 
    });
});

// --- RUTA 2: WEBHOOK (ElevenLabs enviará aquí el resumen al terminar) ---
// Esto permite que sigas guardando las conversaciones en tu MongoDB
app.post('/api/webhook/elevenlabs', async (req, res) => {
    const data = req.body;
    
    try {
        await conectarDB();
        
        // ElevenLabs envía un objeto con la transcripción y el análisis
        const nuevaSesion = new SesionPractica({
            alumnoId: "alumno_pro_2026", // O el ID que identifiques
            tema: "Examen B1 ConvAI",
            estado: 'completada',
            interacciones: data.transcript?.map(t => ({
                alumnoInput: t.user_message,
                iaRespuesta: t.agent_message
            })) || [],
            evaluacionFinal: {
                feedback: data.analysis?.transcript_summary || "Sesión terminada",
                puntuacion: 0 // ElevenLabs puede calcular esto si lo configuras en su dashboard
            }
        });

        await nuevaSesion.save();
        res.status(200).send("Sesión guardada");
    } catch (error) {
        console.error("Error guardando webhook:", error);
        res.status(500).send("Error");
    }
});

// --- RUTA 3: STATUS ---
app.get('/', async (req, res) => {
    await conectarDB();
    res.json({ status: "API ConvAI Online 🚀" });
});

export default app;
