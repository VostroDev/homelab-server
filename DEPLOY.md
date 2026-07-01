# HomeLab Server — Linux Deployment Guide

This guide covers deploying the HomeLab server on a **Raspberry Pi 3/4/5**, any **Debian/Ubuntu Linux** machine (e.g. Lenovo Miix running Debian), or an **Android phone running Termux + proot** (e.g. Galaxy S9).

---

## What you need

- Raspberry Pi 3 or newer **OR** any Linux laptop/mini-PC running Debian/Ubuntu
- A keyboard + monitor (first time only), or SSH access
- The laptop or Pi connected to your classroom WiFi/network
- A USB stick or internet access to transfer the project files

---

## Step 1 — Install Node.js 22

Open a terminal on the Linux machine and run these commands one at a time:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

Close the terminal and open a new one, then:

```bash
nvm install 22
nvm use 22
node --version
```

You should see `v22.x.x`. If you do, Node is ready.

---

## Step 2 — Get the project onto the Linux machine

### Option A — Git / GitHub (recommended)

SSH into the Miix first:

```powershell
ssh wilteq@172.22.2.26
```

Then on the Miix:

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/VostroDev/homelab-server.git ~/homelab-server
```

That's it — no USB stick, no rsync needed.

**Future updates:** just pull and restart:

```bash
cd ~/homelab-server
git pull
pm2 restart homelab
```

---

## Step 2 (alternative) — Copy the project to the Linux machine

### Option A — USB stick (no internet needed)

1. On your Windows machine, open the project folder:
   `C:\Users\rwils\CursorProjects\Blynk`

2. Copy everything **except** these two folders (they are not needed):
   - `node_modules`
   - `data`

3. Paste onto the USB stick, then plug it into the Linux machine

4. Copy the folder to the home directory:
   ```bash
   cp -r /media/usb/Blynk ~/homelab-server
   ```
   *(replace `/media/usb/Blynk` with the actual USB mount path — check with `ls /media/` or `ls /mnt/`)*

### Option B — Git + GitHub (recommended for long term)

On your Windows machine, push the project to GitHub first:
```bash
cd C:\Users\rwils\CursorProjects\Blynk
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/vostrodev/homelab-server.git
git push -u origin main
```

Then on the Linux machine:
```bash
git clone https://github.com/vostrodev/homelab-server.git ~/homelab-server
```

---

## Step 3 — Install dependencies

```bash
cd ~/homelab-server
npm install
```

You should see packages installing. No errors about native modules — everything is pure JavaScript.

---

## Step 4 — Test the server

```bash
npm start
```

You should see:
```
[MQTT] Broker listening on port 1883
[HTTP] Server running at http://localhost:3000
[HTTP] Network access: http://192.168.x.x:3000
[MQTT] ESP32 broker IP for students: 192.168.x.x:1883
```

Note the **Network access IP** — this is what students type into their browsers and Arduino sketches.

Open a browser on another device on the same WiFi and go to `http://192.168.x.x:3000` to confirm it loads.

Press `Ctrl + C` to stop the server for now.

---

## Running alongside Home Assistant + EMQX (Lenovo Miix)

If the machine already runs Home Assistant and EMQX, you have **one port conflict**: EMQX owns port 1883 (MQTT) and this server's built-in Aedes broker also wants 1883.  Everything else is fine — Home Assistant runs on 8123 and the HomeLab dashboard runs on 3000.

**Fix: run Aedes on port 1884 instead.**

When starting with PM2 (see Step 5), pass the environment variable:

```bash
pm2 start server/index.js --name homelab --env MQTT_PORT=1884
```

Or if you want it stored permanently in PM2, create `ecosystem.config.js` in the project folder:

```js
module.exports = {
  apps: [{
    name: 'homelab',
    script: 'server/index.js',
    env: {
      HTTP_PORT: 3000,
      MQTT_PORT: 1884,
    },
  }],
};
```

Then start with:
```bash
pm2 start ecosystem.config.js
pm2 save
```

**Update the ESP32 sketch** — students need to pass `1884` as the port in `begin()`:

```cpp
Homelab.begin(WIFI_SSID, WIFI_PASSWORD, AUTH_TOKEN, SERVER_IP, 1884);
//                                                              ^^^^
```

> **Future:** once Home Assistant and EMQX move to a different machine, remove the `MQTT_PORT` env var (or change it back to 1883) and update the sketches to use the default again.

---

## Step 5 — Make the server start automatically on boot

Install PM2 (a process manager that keeps Node apps running):

```bash
npm install -g pm2
```

Start the server with PM2:

```bash
cd ~/homelab-server
pm2 start server/index.js --name homelab
```

*(If you set up `ecosystem.config.js` above for the EMQX conflict, use `pm2 start ecosystem.config.js` instead.)*

Save the process list so PM2 remembers it:

```bash
pm2 save
```

Tell PM2 to start on boot — this prints a command you must copy and run:

```bash
pm2 startup
```

It will print something like:
```
[PM2] To setup the Startup Script, copy/paste the following command:
sudo env PATH=$PATH:/home/pi/.nvm/versions/node/v22.17.0/bin pm2 startup systemd -u pi --hp /home/pi
```

**Copy that entire `sudo` command and run it.**

---

## Step 6 — Verify auto-start works

Reboot the machine:

```bash
sudo reboot
```

After it comes back up, open a browser on another device and go to `http://192.168.x.x:3000` — the dashboard should load without you doing anything.

---

## Step 7 — Find the server's IP address

The IP address can change if the router assigns a new one after a reboot. To always know the current IP:

```bash
hostname -I
```

**Tip — set a static IP** so the IP never changes and students always use the same address. On a Raspberry Pi running Raspberry Pi OS:

```bash
sudo nano /etc/dhcpcd.conf
```

Add these lines at the bottom (adjust to your network):

```
interface wlan0
static ip_address=192.168.1.50/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8
```

Save with `Ctrl+X → Y → Enter`, then reboot. The Pi will always be at `192.168.1.50`.

---

## Useful PM2 commands

| Command | What it does |
|---|---|
| `pm2 status` | Show if the server is running |
| `pm2 logs homelab` | View live server logs |
| `pm2 restart homelab` | Restart the server |
| `pm2 stop homelab` | Stop the server |

---

## Updating the server

When you make changes on your Windows machine and want to deploy them:

### If using Git (recommended):
```bash
cd ~/homelab-server
git pull
pm2 restart homelab
```

### If using USB:
Copy the updated files to the Linux machine, then:
```bash
pm2 restart homelab
```

The `data/homelab.db` database file is **not overwritten** by rsync or USB copy — student data is safe.

---

## Firewall (if the dashboard is unreachable from other devices)

If students can't reach the server from their browsers, the firewall may be blocking ports. Open ports 3000 and 1883 (or 1884 if running alongside EMQX):

```bash
sudo ufw allow 3000
sudo ufw allow 1883   # default MQTT port
sudo ufw allow 1884   # only needed if running alongside EMQX
sudo ufw reload
```

---

---

## Galaxy S9 (Android) — Termux + proot deployment

The entire server stack is pure JavaScript with no native addons, so it runs on Termux without any compilation.  The only requirement is **Node.js 22+** for the built-in `node:sqlite` module.

### Prerequisites

- Termux installed from [F-Droid](https://f-droid.org/packages/com.termux/) (the Play Store version is outdated)
- `proot-distro` already set up with an Ubuntu environment (you had this for Home Assistant)
- The phone plugged in or on a charger when running as a server

---

### Step 1 — Enter your proot Ubuntu environment

```bash
proot-distro login ubuntu
```

*(Replace `ubuntu` with whatever name you gave the distro — check with `proot-distro list`.)*

---

### Step 2 — Install nvm and Node.js 22

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

Close and reopen the proot session (type `exit`, then `proot-distro login ubuntu` again), then:

```bash
nvm install 22
nvm use 22
node --version   # should print v22.x.x
```

---

### Step 3 — Get the project onto the phone

**Option A — Git (recommended)**

```bash
apt update && apt install -y git
git clone https://github.com/YOUR_USERNAME/homelab-server.git ~/homelab-server
```

**Option B — Transfer over WiFi with scp**

On your Windows machine (PowerShell):
```powershell
scp -r "C:\Users\rwils\CursorProjects\Blynk" YOUR_PHONE_IP:~/homelab-server
```
*(Set up SSH in Termux first: `pkg install openssh && sshd`)*

**Option C — USB cable (via adb)**

```bash
# on Windows
adb push "C:\Users\rwils\CursorProjects\Blynk" /sdcard/homelab-server
# then inside proot
cp -r /sdcard/homelab-server ~/homelab-server
```

In all cases, skip copying `node_modules` and `data` — they are rebuilt on the phone.

---

### Step 4 — Install dependencies and test

```bash
cd ~/homelab-server
npm install
npm start
```

You should see:
```
[MQTT] Broker listening on port 1883
[HTTP] Server running at http://localhost:3000
[HTTP] Network access: http://192.168.x.x:3000
[MQTT] ESP32 broker IP for students: 192.168.x.x:1883
```

Open a browser on another device on the same WiFi and visit `http://192.168.x.x:3000` to confirm the dashboard loads.

Press `Ctrl + C` to stop for now.

---

### Step 5 — Keep it running with PM2

```bash
npm install -g pm2
cd ~/homelab-server
pm2 start server/index.js --name homelab
pm2 save
pm2 startup
```

PM2 startup will print a `sudo env …` command — copy and run it.

---

### Step 6 — Auto-start proot + the server on phone reboot

Termux itself doesn't survive a reboot unless you use **Termux:Boot**.

1. Install [Termux:Boot](https://f-droid.org/packages/com.termux.boot/) from F-Droid
2. Open Termux:Boot once so it registers as a boot service
3. Create the boot script:

```bash
mkdir -p ~/.termux/boot
```

Then create the file `~/.termux/boot/start-homelab.sh` with this content:

```bash
#!/data/data/com.termux/files/usr/bin/bash
# Wait for the network to be ready
sleep 10
proot-distro login ubuntu -- bash -c "source ~/.nvm/nvm.sh && pm2 resurrect"
```

Make it executable:

```bash
chmod +x ~/.termux/boot/start-homelab.sh
```

On next reboot, Termux:Boot will run this script, which enters proot and tells PM2 to bring the server back up.

---

### Step 7 — Set a static IP (optional but recommended)

Your phone's WiFi IP can change after reconnecting. To keep a fixed address, set a **static IP in your router's DHCP reservation** (look for "DHCP binding" or "Address reservation" in your router admin page) using the phone's MAC address. This way ESP32s and students always use the same URL.

You can also find the current IP any time with:

```bash
ip addr show wlan0 | grep 'inet '
```

---

### Useful PM2 commands (inside proot)

| Command | What it does |
|---|---|
| `pm2 status` | Show if the server is running |
| `pm2 logs homelab` | View live server logs |
| `pm2 restart homelab` | Restart the server |
| `pm2 stop homelab` | Stop the server |

---

### Keep the phone awake and charging

Android aggressively kills background processes. To prevent this:

- Go to **Settings → Battery → App power management** and set Termux to **Unrestricted** (no background restrictions)
- Disable **Adaptive battery** for Termux
- Leave the phone plugged in if it will be a permanent server

---

## Troubleshooting

**`nvm: command not found` after install**
Close and reopen the terminal — nvm needs a fresh shell session.

**Port already in use on startup**
Another process is using port 3000 or 1883. Find and kill it:
```bash
sudo lsof -i :1883
sudo kill <PID shown>
```

**ESP32 can't connect to MQTT**
- Check `hostname -I` to confirm the server IP
- Make sure the Pi/laptop and ESP32 are on the same WiFi network
- Check `pm2 logs homelab` for connection messages

**Dashboard loads but no data appears**
- Check the device dot — it should turn green when the ESP32 connects
- Confirm the AUTH_TOKEN in the sketch matches the token on the Devices page
- Check `pm2 logs homelab` for `[MQTT] Device connected:` messages

