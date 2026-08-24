# Pablo ASA

App de Windows para ARK: Survival Ascended: FOV, execs y comandos de consola. **No usa INIs de ASE** (en ASA no funcionan igual).

El auto-update va por **GitHub Releases** (`Irfvvv/Pablo-ASA`). Tú no tienes que estar en el PC: GitHub guarda el instalador y la app de tus amigos lo descarga sola al abrirla.

## Tus amigos

1. Instalan **una vez** `Pablo ASA Setup.exe` (como `Pablo ARK App Setup.exe`).
2. Luego la app se actualiza sola al abrirla. No hace falta otro Setup.

El repo tiene que ser **público**.

## FOV

En la pestaña FOV escribes `170` y la app cierra ASA, guarda `FOVMultiplier` en `GameUserSettings.ini` y lo reabre por Steam (igual que Pablo ARK App). En consola: `fov 170`.

## Commands

Lista de cvars con qué quitan y qué ponen. Copia off/on a consola o a un exec.

## Publicar un update (desde cualquier sitio)

No hace falta tu PC. En GitHub: crea un tag `v1.0.1` (y sube `version` en `package.json`). Actions monta el `.exe` y lo deja en Releases. Las apps ya instaladas lo pillan solas.

```powershell
# o desde tu PC, si quieres
npm version patch
git push --follow-tags
```

## Desarrollo

```powershell
npm install
npm start
npm run dist
```

`npm start` no auto-updatea (solo el instalador).
