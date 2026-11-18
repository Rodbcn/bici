# Changelog

## Sin publicar
- Primera versión: entrenamientos por niveles con duración ajustable, rodar libre, editor de
  entrenamientos, historial y ajustes con diagnóstico de la bici.
- Control de la bici con el protocolo propio iConsole (servicio 0xFFF0) que usaba Console+ 1.x:
  cambia el nivel de resistencia y lee la telemetría. FTMS queda como respaldo.
- Seguridad: el nombre Bluetooth y los datos guardados ya no se interpretan como HTML; política
  CSP que solo permite código propio; datos guardados validados; nivel enviado a la bici acotado.
- Pantalla de entreno: el pulso ocupa el recuadro que antes mostraba el tiempo, y el tiempo total
  aparece debajo del tiempo restante del tramo.
- Varios usuarios (nombre, edad, peso y altura), elegibles arriba en Inicio. Cada entreno se
  guarda con su usuario y el historial se puede filtrar por usuario.
- El recuadro del pulso se pone ámbar (≥ 85 % del pulso máximo) o rojo (≥ 95 %), con el máximo
  calculado por la edad del usuario (208 − 0,7 × edad).
- Vídeos para aprender mientras pedaleas: lista de historia y ciencia de unos 15 min, se elige
  uno en el entreno y se ve arriba en la pantalla (la pausa también pausa el vídeo). Se pueden
  añadir vídeos propios pegando un enlace de YouTube.
