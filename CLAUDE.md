# cups-web (PWA)

## Flujo de ramas
- Todo el desarrollo y las pruebas van en la rama **`prueba`** (siempre la misma). No hagas commit en `main`.
- `main` solo se actualiza cuando el usuario dice **"publícalo"** (skill `publicar`: merge `prueba` → `main` + push).
- Si no estás en `prueba` al empezar a trabajar, haz `git checkout prueba`.
- La APK equivalente es `C:\Dev\Cups` (misma regla). Ambas deben verse y comportarse igual; la APK es la referencia.

## Probar en local
`python -m http.server 8080` en esta carpeta y abrir http://localhost:8080 (recarga forzada por el service worker).
