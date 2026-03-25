// models/SesionPractica.js

import mongoose from 'mongoose';

// Sub-esquema para almacenar los detalles de cada error corregido por la IA
const CorreccionSchema = new mongoose.Schema({
    fraseOriginal: { type: String, required: true },
    tipoError: { type: String, required: true }, 
    fraseCorregida: { type: String, required: true }
});

// Esquema principal para toda la sesión de práctica
const SesionPracticaSchema = new mongoose.Schema({
    alumnoId: { type: String, required: true, index: true }, 
    tema: { type: String, default: 'Conversación Libre' },

    interacciones: [{
        alumnoInput: String,         
        iaRespuesta: String,         
        correccion: CorreccionSchema,  
        timestamp: { type: Date, default: Date.now }
    }],

    fechaInicio: { type: Date, default: Date.now },
    fechaFin: Date, 
    estado: { type: String, default: 'pendiente' } 
}, { timestamps: true });


    // --- NUEVO CAMPO ---
    evaluacionFinal: {
        puntuacion: Number,
        feedback: String,
        nivelDetectado: String,
        consejo: String
    }
});

// Cambiado a exportación de ES Modules
export default mongoose.model('SesionPractica', SesionPracticaSchema);
