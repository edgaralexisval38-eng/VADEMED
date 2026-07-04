# VadeMed

Guía clínica rápida en un solo HTML: vademécum de medicamentos (con calculadora pediátrica y receta copiable), herramientas/escalas y **89 temas/resúmenes** clínicos con buscador global.

## Uso local
Abre `index.html` en el navegador (doble clic).

## Publicar en GitHub Pages
1. Sube **todo el contenido de esta carpeta** a un repositorio (respeta la estructura de carpetas).
2. En el repo: **Settings → Pages → Branch: `main` / root → Save**.
3. En 1–2 min tendrás la app en `https://TU_USUARIO.github.io/TU_REPO/`.

## Estructura (no renombrar archivos ni carpetas)
```
index.html                     ← la app (todo el vademécum incrustado)
.nojekyll                      ← evita el procesamiento Jekyll de GitHub Pages
RESUMENCLINIC/RESUMENES/       ← los 89 resúmenes que abren los "Temas"
    *.html
    imagenes/
```

> GitHub Pages distingue mayúsculas/minúsculas: si renombras un resumen, actualiza también su ruta en el arreglo `TEMAS` dentro de `index.html`.
