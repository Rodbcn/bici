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
