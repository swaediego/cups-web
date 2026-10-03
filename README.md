# cups (web / PWA)

Calculadora de dólares, euros y bolívares con la tasa oficial del BCV. Versión web instalable
de la app Android [cups](https://github.com/swaediego/cups), pensada sobre todo para iPhone.

- Tasas oficiales del BCV vía [DolarApi Venezuela](https://ve.dolarapi.com) (historial desde 2023).
- Historial por fecha y tasa del siguiente día hábil cuando ya está publicada.
- Funciona sin conexión: guarda las tasas en el dispositivo.
- Sin dependencias ni paso de compilación: HTML + CSS + JS.

## Probar en local

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

(El service worker solo funciona en `localhost` o HTTPS.)

## Publicar con GitHub Pages

1. En el repositorio: **Settings → Pages**.
2. *Source*: **Deploy from a branch** → rama `main`, carpeta `/ (root)` → **Save**.
3. A los pocos minutos queda en `https://<usuario>.github.io/<repositorio>/`.

Todas las rutas son relativas, así que funciona en esa subcarpeta sin cambios.

## Instalar en iPhone

1. Abrir la dirección en **Safari** (en iOS solo Safari puede instalar PWAs).
2. Tocar **Compartir** → **Añadir a pantalla de inicio**.

En Android (Chrome) aparece un botón **Instalar** dentro de la app.

## Al cambiar archivos

Sube la versión de `CACHE` en `sw.js` (`cups-shell-v1` → `v2`) si cambias archivos de la lista `SHELL`,
para que los dispositivos descarguen la nueva interfaz.
