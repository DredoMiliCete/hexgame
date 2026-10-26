# Playing online, step by step

One person **hosts** (runs the server on their computer), the other just opens a link in a browser.
Only the host needs to install anything.

## 0. What you need
| | Host | Friend |
|---|---|---|
| Software | **Node.js 18 or newer** (download the "LTS" version from https://nodejs.org) and this game folder | **Nothing**, only a browser |
| Hotseat (same screen) | still works with just Python, as before | |

## 1. Host: start the server
1. Open the game folder.
2. **Windows:** double-click `run.bat`. **Mac / Linux:** run `./run.sh` in a terminal (or `npm start`).
3. A window shows something like:
   ```
   On this computer:       http://localhost:8000
   Same Wi-Fi / network:   http://192.168.1.23:8000
   ```
   Leave that window open for as long as you want to play. Closing it stops the server (and every game running on it).
4. The first time, Windows may ask to allow Node.js through the firewall. Choose **Allow** (private networks).

## 2. Host: pick how your friend will reach you
**A. Same Wi-Fi / same network (easiest).** Your friend opens the **"Same Wi-Fi / network"** address from step 1 (for example `http://192.168.1.23:8000`). Type it exactly, with `http://`.

**B. Over the internet, no router setup (a free tunnel).**
1. Install **cloudflared** (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or **ngrok** (https://ngrok.com/download).
2. With the game server already running, open a second terminal and run
   `cloudflared tunnel --url http://localhost:8000`   (or `ngrok http 8000`).
3. It prints a public address such as `https://something-random.trycloudflare.com`. **That is the address your friend uses.** It changes every time you start the tunnel, and the tunnel must stay open while you play.

**C. A server that is always on (optional).** Any host that runs Node.js works (Render, Railway, Fly.io, a VPS...). Upload this folder, use `node server/server.js` as the start command; the port is read from the `PORT` variable. Free plans usually go to sleep when nobody uses them, so the first load can be slow.

> Forwarding a port on your home router also works, but it is not recommended (no HTTPS, and it exposes your computer).

## 3. Host: create the game
1. Open the address in your browser (on your own computer `http://localhost:8000` is fine; with a tunnel you can use either).
2. Main menu → **Play online**.
3. Optionally type your name. Choose the **map**, the **starting player** and **your side** (or leave them on Random). The *Starting AP* values come from **Options**. A custom map you made is sent to your opponent automatically.
4. Press **Create game**. You land in the lobby, which shows a 5-letter **room code** and an **invite link**.
5. Press **Copy link** and send it to your friend (chat, e-mail...). Sending only the code works too.

## 4. Friend: join
1. Open the link. The *Join a game* box is already filled in. (If you only have the code: open the address your friend gave you, choose **Play online** and type the code.)
2. Optionally type your name, then press **Join game**. You are now in the same lobby.

## 5. Both: pick teams and play
1. Pick your **7 heroes**: click heroes, or choose one of your saved compositions from the dropdown.
2. Press **Ready**. You can press **Change team** to undo it until the game starts.
3. When **both** players are ready the game starts by itself.
4. While heroes are being placed, you only see **your own** heroes; the opponent's stay face down until the placement is over. Your side carries a **YOU** tag at the top.
5. The bottom area asks you what to do. When it is the opponent's decision it says **"Waiting for Red..."** (or Blu).

## If something goes wrong
- **The connection drops / you close the tab:** the game waits for you. Open the same address again in the **same browser** → **Play online** → **Resume**. (If your browser reloads the page by itself, it reconnects on its own.)
- **"Room not found":** check the code, and check that the host's server window is still open. Games live in memory, so restarting the server ends them.
- **Your friend cannot open the address:** they may be on a different network (use the tunnel, option B), or a firewall is blocking Node.js, or they typed `https://` for a Wi-Fi address (it must be `http://`).
- **"Port 8000 is already in use":** another program uses it. Start with `node server/server.js --port 8001` and use `:8001` in the addresses.
- **Testing alone on one computer:** open the game in two *different* browsers (or one normal window and one private window), because each browser keeps its own player session.
- **Leaving a room before the game starts:** press **Leave room** in the lobby. This frees your seat.

## What this first version does not do yet
- Only **Constructed** mode is online (both players pick their own 7). **Draft** online is the next step.
- *Editable Heroes* stat edits are not shared: online games use the values in `roster.csv` on the host's server.
- There is no timer and no automatic forfeit: if someone disappears, the game simply waits.
- Games are kept in the server's memory only.

## How it stays fair (for the curious)
The rules run **on the server**. Your browser only shows the game and sends your decisions; the server checks that each decision is one that was actually offered to you, so it cannot be faked. Dice are rolled on the server. Each player only receives the information they are allowed to see: face-down heroes, the VIP choice and which of the opponent's Rats is Squeak are never sent to the other player.
