# Retro Duo

Retro Duo es una web estática para jugar títulos de Sega Mega Drive desde el navegador y compartir la partida con otra PC. Está pensada para publicarse directamente en GitHub Pages, sin proceso de compilación y sin instalar una aplicación.

## Qué incluye

- Biblioteca local con accesos para Streets of Rage 1, 2 y 3, Golden Axe, Alien Storm, Gunstar Heroes y otros títulos de Mega Drive.
- Importación privada de archivos: la ROM queda en IndexedDB dentro del navegador que la cargó.
- Emulación mediante EmulatorJS y el núcleo `segaMD`.
- **Duo Direct**, un modo WebRTC creado para este proyecto: solo el anfitrión necesita la ROM; la segunda PC recibe video y envía controles.
- **Código de sala**: emparejamiento automático con un código de 4 dígitos, sin copiar y pegar. El anfitrión crea la sala y el jugador 2 escribe el código. El intercambio manual de oferta/respuesta queda como método de respaldo.
- Compatibilidad del jugador 2 con teclado, joystick y controles táctiles.
- **Neon Brawl**, una demo original incluida para probar video, audio y controles sin usar una ROM comercial.
- Netplay integrado de EmulatorJS como opción experimental.
- Diseño responsive, pantalla completa, estados de conexión, guía y configuración local.

## Qué no incluye

Este repositorio no contiene ni descarga ROMs comerciales, BIOS, claves, portadas oficiales, música extraída de juegos ni archivos propiedad de Sega o de terceros. Los nombres de los juegos son únicamente accesos descriptivos para que cada usuario asocie su propio archivo autorizado.

Usá solo archivos que estés legalmente autorizado a utilizar. No agregues ROMs al repositorio, en especial si es público.

## Publicar en GitHub Pages

1. Creá un repositorio nuevo en GitHub, por ejemplo `retro-duo`.
2. Subí **el contenido de esta carpeta** a la raíz del repositorio. `index.html` debe quedar en la raíz.
3. En GitHub, abrí **Settings → Pages**.
4. En **Build and deployment**, elegí **Deploy from a branch**.
5. Seleccioná la rama `main`, carpeta `/ (root)`, y guardá.
6. GitHub publicará una dirección similar a:

   `https://TU-USUARIO.github.io/retro-duo/`

No se requieren Node.js, npm, Vercel ni un servidor propio para Duo Direct.

## Probar primero la demo

1. Abrí Retro Duo en la PC anfitriona.
2. Entrá en **Probar demo legal → Neon Brawl**.
3. En la otra PC, abrí **Entrar como jugador 2**.
4. En el anfitrión, presioná **Crear conexión directa** y copiá la oferta.
5. En la otra PC, pegá la oferta y presioná **Generar respuesta**.
6. Copiá la respuesta y pegala en la PC anfitriona.
7. Cuando el estado indique **Conectado**, el jugador 2 controla al personaje celeste.

En la demo, el perfil remoto recomendado es **Clásico**:

- A: golpe
- B: patada
- C: especial
- Flechas: movimiento
- Enter/Start: comenzar

## Jugar una ROM desde dos PC

### Método recomendado: Código de sala

1. En la PC anfitriona, abrí la biblioteca e importá tu archivo local.
2. Abrí el juego y seleccioná **Duo Direct**.
3. Hacé clic dentro del emulador para iniciar el juego y habilitar el audio del navegador.
4. Presioná **Crear sala con código**. Aparece un número de 4 dígitos.
5. En la segunda PC, abrí `remote.html`, escribí ese código y presioná **Unirme a la partida**.
6. Cuando el estado indique **Conectado**, aparece la pantalla y el jugador 2 juega con flechas, Z/X/C, Enter o un joystick.

No hay que copiar ni pegar nada. El emparejamiento usa un servidor de señalización (por defecto el servicio gratuito público de PeerJS); la ROM nunca se envía a la segunda PC, solo se transmite el canvas del emulador y se reciben los controles por WebRTC.

Si el servicio de salas no está disponible, la página lo detecta y ofrece automáticamente el método manual descrito abajo.

### Método de respaldo: Duo Direct manual (copiar y pegar)

1. En la vista del anfitrión, abrí **usar el modo manual (copiar y pegar)**.
2. Presioná **Crear conexión directa manual** y copiá la oferta.
3. La segunda persona abre `remote.html`, activa el modo manual, pega la oferta y genera una respuesta.
4. El anfitrión pega la respuesta y completa la conexión.

Este método no depende de ningún servidor de salas: el intercambio se hace una sola vez, directamente entre las dos personas.

### Método alternativo: Netplay experimental

Ambas PC deben importar exactamente el mismo archivo. Retro Duo calcula un ID numérico a partir de la huella SHA-256, lo que ayuda a usar el mismo identificador en ambos equipos.

El Netplay integrado depende de la versión de EmulatorJS y de un servidor externo. En versiones actuales puede no mostrar el botón o fallar. Por eso no es el método predeterminado. Para experimentarlo, cambiá el canal a `Latest` en Configuración y definí un servidor Netplay compatible.

## Controles del emulador

La pantalla remota envía los índices estándar utilizados por EmulatorJS:

- Dirección: arriba 4, abajo 5, izquierda 6, derecha 7
- Select: 2
- Start: 3
- Acciones del perfil Clásico: A 8, B 0, C 9

Si A y B aparecen invertidos dentro de un juego, el jugador 2 puede cambiar el perfil sin recargar la página.

## Compatibilidad recomendada

- Chrome o Microsoft Edge recientes.
- Conexión por cable o Wi-Fi de 5 GHz.
- HTTPS, que GitHub Pages proporciona automáticamente.
- Dos equipos dentro de la misma red para obtener la menor latencia.

Duo Direct utiliza servidores STUN públicos para descubrir la ruta entre los navegadores. No incluye un servidor TURN con credenciales. Algunas redes corporativas, CGNAT muy restrictivo, VPN o firewalls pueden impedir la conexión directa. En esos casos, probá desde la misma red doméstica o configurá tu propia infraestructura ICE en el panel de Configuración.

## Audio

- En Neon Brawl, el audio se genera dentro de la demo y se incorpora a la transmisión.
- En las ROMs, la captura de audio es de mejor esfuerzo porque depende de cómo la versión de EmulatorJS exponga su grafo Web Audio.
- Si el jugador 2 no recibe sonido, el juego sigue siendo controlable. El anfitrión puede usar el sonido local o probar otra versión de EmulatorJS.

## Privacidad

- Las ROMs se almacenan en IndexedDB del navegador anfitrión.
- No se incluyen servicios de analítica, cuentas ni base de datos remota.
- Las ofertas y respuestas WebRTC pueden contener candidatos ICE y direcciones técnicas de red. Compartilas únicamente por un canal privado y no las publiques.
- Cerrar o recargar cualquiera de las dos páginas termina la conexión.

## Estructura

```text
retro-duo/
├── index.html                 Biblioteca e importación local
├── player.html                Emulador y panel del anfitrión
├── remote.html                Video y control del jugador 2
├── demo.html                  Neon Brawl, demo original
├── assets/
│   ├── css/                   Estilos de las cuatro vistas
│   ├── icons/                 Ícono original del proyecto
│   └── js/
│       ├── app.js             Biblioteca y ajustes
│       ├── db.js              IndexedDB
│       ├── player.js          Integración EmulatorJS y anfitrión P2P
│       ├── remote.js          Receptor WebRTC y controles
│       ├── demo.js            Juego original de prueba
│       ├── p2p.js             Señalización manual WebRTC
│       ├── quickmatch.js      Emparejamiento por código de sala (PeerJS)
│       └── config.js          Configuración predeterminada
├── LEGAL.md
├── LICENSE
└── .nojekyll
```

## Probar localmente

No abras `index.html` con doble clic: los módulos JavaScript necesitan un servidor HTTP. Desde esta carpeta ejecutá uno de estos comandos:

```bash
python -m http.server 8080
```

Luego abrí `http://localhost:8080/`.

También podés ejecutar la validación sin dependencias:

```bash
npm run check
```

## Personalización

- Títulos sugeridos: `assets/js/catalog.js`
- Canal de EmulatorJS, servidores ICE y servidor de salas (`peerServer`): `assets/js/config.js`
- Colores y componentes globales: `assets/css/styles.css`
- Demo: `assets/js/demo.js`

No guardes secretos TURN en `config.js` si el repositorio será público. Usá credenciales efímeras desde un servicio propio si decidís agregar TURN.

## Dependencias y licencias de terceros

Retro Duo carga EmulatorJS desde su CDN oficial en tiempo de ejecución. EmulatorJS es un proyecto separado y se distribuye bajo GPL-3.0. No está incorporado dentro de este ZIP. Los navegadores implementan WebRTC y las APIs de almacenamiento utilizadas por el proyecto.

El modo **Código de sala** carga PeerJS desde su CDN (`unpkg.com`) y usa por defecto su servidor de señalización público gratuito. PeerJS se distribuye bajo licencia MIT. Ese servidor solo intercambia los datos mínimos para que dos navegadores se encuentren; el video, el audio y los controles viajan directamente entre las dos PC. Para no depender del servicio público podés levantar tu propio PeerServer y configurarlo en `peerServer` dentro de `assets/js/config.js`.

Fuentes técnicas principales:

- EmulatorJS: https://emulatorjs.org/
- Documentación de EmulatorJS: https://emulatorjs.org/docs/
- PeerJS: https://peerjs.com/
- WebRTC API: https://developer.mozilla.org/docs/Web/API/WebRTC_API
- `HTMLCanvasElement.captureStream()`: https://developer.mozilla.org/docs/Web/API/HTMLCanvasElement/captureStream

El código original de Retro Duo se entrega bajo la licencia indicada en `LICENSE`. Las marcas, nombres y juegos mencionados pertenecen a sus respectivos titulares.
