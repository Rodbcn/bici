// Vídeos de divulgación para ver mientras se pedalea (comprobados el 18-11-2026:
// existen, se pueden incrustar y duran lo indicado).
'use strict';

const VIDEO_TOPICS = { historia: 'Historia', ciencia: 'Ciencia', otros: 'Otros' };

const BUILTIN_VIDEOS = [
  // Historia
  { id: 'EJmzbcbSL18', min: 13.27, topic: 'historia', channel: 'HistoriaEnComic', title: 'El anciano que humilló al Imperio Romano: la defensa de Siracusa' },
  { id: 'CCEbA7eINE8', min: 13.22, topic: 'historia', channel: 'HistoriaEnComic', title: 'Santísima Trinidad: el coloso que Nelson nunca pudo vencer' },
  { id: '2gfIxCyyByw', min: 15.63, topic: 'historia', channel: 'HistoriaEnComic', title: 'Baybars: el esclavo que arrodilló a mongoles y cruzados en Ain Jalut' },
  { id: '6Kfql-FVclI', min: 16.78, topic: 'historia', channel: 'HistoriaEnComic', title: 'El oro inca que destruyó a los conquistadores: Pizarro contra Almagro' },
  { id: 'XqnqRV2I2gw', min: 12.13, topic: 'historia', channel: 'HistoriaEnComic', title: '80 días: los 13 bergantines y la caída de Tenochtitlan' },
  { id: 'UNlTFKQoWnY', min: 16.07, topic: 'historia', channel: 'Historia Sin Filtro', title: 'El estúpido error que detonó la Primera Guerra Mundial' },
  { id: 'PZnSk3rNh4A', min: 13.32, topic: 'historia', channel: 'Historia Sin Filtro', title: 'Los datos más sorprendentes de la Segunda Guerra Mundial' },
  { id: 'XEhPZu12Yuo', min: 16.70, topic: 'historia', channel: 'Pero eso es otra Historia', title: '¿Existen calamares gigantes? El mito del Kraken' },
  { id: 'twOnuIx2bj4', min: 17.32, topic: 'historia', channel: 'Academia Play', title: 'Así robó la Italia fascista su primer Mundial' },
  // Ciencia y tecnología
  { id: 'YyQxTTYbOg8', min: 15.10, topic: 'ciencia', channel: 'QuantumFracture', title: 'Galileo y el misterio de los números impares' },
  { id: '6uC_0NVxI2o', min: 14.32, topic: 'ciencia', channel: 'QuantumFracture', title: 'Todas las galaxias van hacia aquí' },
  { id: 'aM_9wRCbV3M', min: 15.67, topic: 'ciencia', channel: 'QuantumFracture', title: 'El fluido más polémico de la física' },
  { id: 'C4j4BZFiGgM', min: 16.50, topic: 'ciencia', channel: 'QuantumFracture', title: 'El internet cuántico y su aplicación más insospechada' },
  { id: 'iwa1e-Fxmsc', min: 16.47, topic: 'ciencia', channel: 'QuantumFracture', title: '¿Qué pasó con la perra Laika?' },
  { id: 'eLpXKTgEEbE', min: 13.38, topic: 'ciencia', channel: 'QuantumFracture', title: 'Un chorro más rápido que la luz' },
  { id: '-G3cwPHo1Qw', min: 16.85, topic: 'ciencia', channel: 'QuantumFracture', title: 'Un telescopio bajo el hielo: el Nobel 2026 explicado' },
  { id: 'j2Qke_veYwk', min: 14.82, topic: 'ciencia', channel: 'CdeCiencia', title: 'Te enseño a ver el nuevo color descubierto' },
  { id: 'FH2arxt4kAs', min: 14.97, topic: 'ciencia', channel: 'CdeCiencia', title: 'Cómo la ciencia solucionará el mayor problema de la humanidad' },
  { id: 'gvNXNf17iH8', min: 14.55, topic: 'ciencia', channel: 'CdeCiencia', title: 'Artemis: ¿condenado al fracaso o vuelta a la Luna?' },
  { id: 'F4-Kyt4hPDQ', min: 13.92, topic: 'ciencia', channel: 'CdeCiencia', title: 'Lo que está a punto de pasar con los metales del mundo' },
];
