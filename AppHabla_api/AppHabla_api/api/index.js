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

// Función de conexión mejorada
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
// Cambiamos a gemini-2.0-flash que es el estándar en marzo de 2026
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// RUTA DE PRUEBA: Ahora intentará conectar para decirte si todo está bien
app.get('/', async (req, res) => {
    await conectarDB(); 
    res.json({ 
        mensaje: "API Activa 🚀", 
        dbStatus: isConnected ? "Conectado ✅" : "Desconectado ❌ (Revisa tu MONGODB_URI)" 
    });
});

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

export default app;
