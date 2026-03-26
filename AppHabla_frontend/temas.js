// temas.js

export const TEMAS_ALEMAN = [
    { id: 'rutina', nombre: 'Mi rutina diaria', descripcion: 'Habla sobre lo que haces desde que te levantas hasta que te acuestas.' },
    { id: 'viaje', nombre: 'Planificando un viaje', descripcion: 'Conversa sobre un destino, transporte y actividades de vacaciones.' },
    { id: 'trabajo', nombre: 'Mi trabajo / estudios', descripcion: 'Describe tus asignaturas en el colegio.' },
    { id: 'comida', nombre: 'Cocina y alimentación', descripcion: 'Discute tus comidas favoritas, recetas y hábitos alimenticios.' }
],
const TEMAS_GOETHEB1 = [
    // --- TEIL 1: Gemeinsam etwas planen (Diálogo de planificación) ---
    { id: 'p1_party', tipo: 'planen', nombre: 'Planen: Eine Abschiedsparty (Fiesta de despedida)' },
    { id: 'p1_ausflug', tipo: 'planen', nombre: 'Planen: Ein Ausflug am Wochenende (Excursión)' },
    { id: 'p1_besuch', tipo: 'planen', nombre: 'Planen: Krankenbesuch (Visita a un enfermo)' },
    { id: 'p1_geschenk', tipo: 'planen', nombre: 'Planen: Ein Geschenk kaufen (Comprar un regalo)' },

    // --- TEIL 2 & 3: Ein Thema präsentieren (Opinión y Debate) ---
    { id: 'p2_handy', tipo: 'diskussion', nombre: 'Thema: Handys in der Schule (Móviles en clase)' },
    { id: 'p2_wohnen', tipo: 'diskussion', nombre: 'Thema: Stadt oder Land? (Ciudad o campo)' },
    { id: 'p2_fleisch', tipo: 'diskussion', nombre: 'Thema: Vegetarische Ernährung (Comida vegetariana)' },
    { id: 'p2_internet', tipo: 'diskussion', nombre: 'Thema: Einkaufen im Internet (Compras online)' },
    { id: 'p2_kinder', tipo: 'diskussion', nombre: 'Thema: Brauchen Kinder Markenklamotten? (Ropa de marca)' },
    { id: 'p2_haustiere', tipo: 'diskussion', nombre: 'Thema: Haustiere in der Großstadt (Mascotas en ciudad)' }
];

// Exportamos para que app.js lo pueda usar
export default TEMAS_GOETHEB1;

// El ID se usará internamente, y el nombre se mostrará en la interfaz.
