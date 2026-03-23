// server.js (Usando ES Modules)

import 'dotenv/config'; // Sintaxis moderna para cargar .env
import express from 'express';
import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';
// Importa el modelo (¡Necesita la extensión .js!)
import SesionPractica from './models/SesionPractica.js'; 

const app = express();
app.use(express.json()); 

// --- Configuración Básica ---
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// --- Conexión a MongoDB ---
// Nota: La nueva sintaxis de importación de Mongoose es más limpia
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Conectado a MongoDB'))
    .catch(err => {
        console.error('❌ ERROR FATAL: No se pudo conectar a MongoDB.', err.message);
        process.exit(1); 
    });

// --- Inicialización de Gemini ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = "gemini-2.5-flash"; 

// ==================================================================
// 🚀 ENDPOINTS PARA EL ALUMNO (Práctica de Conversación)
// ==================================================================

/**
 * Endpoint 1: Maneja cada turno de conversación con Gemini, registra la interacción.
 */
app.post('/api/practica/hablar', async (req, res) => {
    const { alumnoId, sesionId, inputAlumno, tema } = req.body;
    
    if (!alumnoId || !inputAlumno) {
        return res.status(400).send({ error: "Datos de alumno o entrada faltantes." });
    }

    try {
        // 1. Recuperar o Crear Sesión
        let sesion = sesionId ? await SesionPractica.findById(sesionId) : null;
        if (!sesion) {
            sesion = new SesionPractica({ alumnoId, tema: tema || 'Mi rutina diaria' }); 
            await sesion.save();
        }
        
        // 2. Construcción del Prompt (Instrucción a la IA)
        const systemPrompt = `
            Eres un profesor de alemán (nivel B1). Mantén una conversación sobre el tema: "${sesion.tema}".
            
            Analiza la última entrada del alumno: "${inputAlumno}".
            
            **REGLAS DE FORMATO:**
            1. Responde primero con tu respuesta conversacional fluida en alemán.
            2. Si detectas un error significativo (gramática, conjugación, etc.), incluye una sección de corrección estructurada.
            3. La corrección DEBE ir delimitada por la etiqueta ---CORRECCION--- y ser un objeto JSON VÁLIDO.
            
            **Ejemplo de formato de salida (si hay error):**
            Das ist ein guter Plan! Was machst du nach dem Frühstück?
            ---CORRECCION---
            {"fraseOriginal": "${inputAlumno}", "tipoError": "Conjugación", "fraseCorregida": "Ich frühstücke um 8 Uhr"}
        `;

        // 3. Llamada a la API de Gemini
        const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
        });

        const fullText = response.text.trim();
        
        // 4. Parsear la Respuesta (Separar conversación de seguimiento)
        let iaRespuesta = fullText;
        let correccionData = null;
        
        const splitText = fullText.split('---CORRECCION---');
        if (splitText.length > 1) {
            iaRespuesta = splitText[0].trim();
            try {
                correccionData = JSON.parse(splitText[1].trim());
            } catch (e) {
                console.error("Error al parsear el JSON de corrección:", e);
            }
        }
        
        // 5. Registrar la Interacción
        const nuevaInteraccion = { alumnoInput, iaRespuesta, correccion: correccionData };
        
        sesion.interacciones.push(nuevaInteraccion);
        await sesion.save();
        
        // 6. Respuesta al Frontend
        res.json({
            sesionId: sesion._id,
            iaRespuesta: iaRespuesta 
        });

    } catch (error) {
        console.error('Error en el endpoint /hablar:', error);
        res.status(500).send({ error: 'Fallo interno en el servidor.' });
    }
});


/**
 * Endpoint 2: Marca una sesión como terminada.
 */
app.post('/api/practica/finalizar', async (req, res) => {
    const { sesionId } = req.body;

    try {
        const sesion = await SesionPractica.findByIdAndUpdate(
            sesionId,
            { fechaFin: new Date(), estado: 'completada' },
            { new: true }
        );

        if (!sesion) {
            return res.status(404).send({ error: 'Sesión no encontrada.' });
        }
        res.json({ message: 'Sesión finalizada con éxito.', sesion });
    } catch (error) {
        console.error('Error al finalizar sesión:', error);
        res.status(500).send({ error: 'Error en el servidor.' });
    }
});


// ==================================================================
// 📊 ENDPOINT PARA EL PROFESOR (Panel de Seguimiento)
// ==================================================================

/**
 * Endpoint 3: Genera un informe resumido del progreso de un alumno.
 */
app.get('/api/profesor/progreso/:alumnoId', async (req, res) => {
    try {
        const alumnoId = req.params.alumnoId;
        
        // Obtener todas las sesiones completadas del alumno
        const sesiones = await SesionPractica.find({ alumnoId, estado: 'completada' }).sort({ fechaInicio: -1 });

        let tiempoTotalMinutos = 0;
        const erroresFrecuentes = {}; 

        for (const sesion of sesiones) {
            // Calcular Tiempo Total
            if (sesion.fechaInicio && sesion.fechaFin) {
                const duracionMs = sesion.fechaFin.getTime() - sesion.fechaInicio.getTime();
                tiempoTotalMinutos += duracionMs / 60000; 
            }

            // Contar y Agrupar Errores 
            sesion.interacciones.forEach(i => {
                if (i.correccion && i.correccion.tipoError) {
                    const tipo = i.correccion.tipoError;
                    erroresFrecuentes[tipo] = (erroresFrecuentes[tipo] || 0) + 1;
                }
            });
        }
        
        // Respuesta del Informe
        res.json({
            alumnoId: alumnoId,
            sesionesCompletadas: sesiones.length,
            tiempoTotalMinutos: Math.round(tiempoTotalMinutos),
            erroresFrecuentes: erroresFrecuentes,
            ultimas5Sesiones: sesiones.slice(0, 5).map(s => ({
                id: s._id,
                fecha: s.fechaFin,
                interacciones: s.interacciones.length,
                tema: s.tema,
            }))
        });

    } catch (error) {
        console.error('Error al generar informe del profesor:', error);
        res.status(500).send({ error: 'Fallo al obtener datos de progreso.' });
    }
});

//Solo levantar el servidor si NO estamos en Vercel
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor local en http://localhost:${PORT}`);
    });
}

// Vercel necesita el export default de la instancia de express
export default app;
