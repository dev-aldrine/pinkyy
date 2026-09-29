# PINKY ($PINKY) - Web3 Solana Viral App 🌸🤙

A complete, high-fidelity replica and adaptation of the viral Solana meme app, branded for **PINKY ($PINKY)**.

---

## 🌟 Features

1. **Snap & Post Your Pinky**:
   - Live camera viewfinder with a pinky finger outline guide.
   - Front/rear camera toggle & native camera fallback for mobile devices.
   - Solana payout wallet input (or auto-linked with connected Phantom wallet).

2. **Phantom Solana Wallet Integration**:
   - Phantom wallet connect and ed25519 signature authentication.
   - Anti-sybil voting system: 1 vote per wallet every 2 minutes.
   - Self-voting prevention.

3. **5-Minute Round & Fee Distribution Engine**:
   - Automated 5-minute round countdown timer with live prize pot in SOL.
   - Real-time leaderboard highlighting the current round winner.
   - Automatic winner recording with Solscan verification transaction links.

4. **The Wall**:
   - Responsive, infinite-scrolling photo wall of community pinky submissions with submission numbers (`#1`, `#2`, ...).
   - Quick vote buttons on hover/touch.
   - Interactive modal viewer with full zoom and X/Twitter share links.

5. **Cross-Device Mobile Flow**:
   - Built-in dynamic QR code generator (`/api/qr`) allowing desktop visitors to scan and open the camera directly on mobile.

6. **Admin Panel**:
   - Add `?admin=pinky_secret_admin_2026` to the URL to enable one-click deletion of inappropriate submissions directly from the wall.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The application will be running at **`http://localhost:3000`**.

---

## 🔑 Live Contract Address (CA) Admin Portal (`/pukinginamo`)

The CA is managed via a dedicated wallet-gated control panel at:
**`http://localhost:3000/pukinginamo`**

- **Authorized Admin Wallet**: `61SRJwucN5iBHemrBTNEqkXAJHNgjTN16Nt1SVFBNJuf`
- **Wallet-Gated Security**: Only the authorized Phantom wallet can connect, sign the authentication challenge, and update the CA.
- **Global Instant Synchronization**:
  - Updating the CA updates the persistent server database (`db.json`) and the configuration on disk (`public/config.js`).
  - All users currently on or opening the website immediately receive the new CA, the "Buy $PINKY" button automatically redirects to `https://pump.fun/coin/<CA>`, and the copyable CA badge updates globally.

---

## ☁️ ImageKit Cloud Storage

All user-submitted pinkies are securely uploaded and stored directly on **ImageKit CDN**:
- **Public Key**: `public_nJ2l/4XG5Z2rgVvL+xKrV7bm76E=`
- **Private Key**: `private_11kmxslj7hVkNxTI/8611rSmSVg=`
- **URL Endpoint**: `https://ik.imagekit.io/joysfairycharms`
- **Folder**: `/pinky_uploads`

---

## 🚀 Deploying on Render (Free & 24/7)

The repository includes a ready-to-deploy [`render.yaml`](file:///d:/PythonProjects/pinky/render.yaml) blueprint.

### Option 1: Automatic 1-Click Blueprint
1. Push this repo to your GitHub/GitLab account.
2. Go to your [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Blueprint**.
4. Select your `pinky` repository and click **Apply**. Render will automatically configure the web service with all environment variables.

### Option 2: Manual Web Service Setup
1. In Render, click **New +** → **Web Service**.
2. Connect your repository.
3. Configure the following settings:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Add the following **Environment Variables** in the Render settings:
   - `IMAGEKIT_PUBLIC_KEY` = `public_nJ2l/4XG5Z2rgVvL+xKrV7bm76E=`
   - `IMAGEKIT_PRIVATE_KEY` = `private_11kmxslj7hVkNxTI/8611rSmSVg=`
   - `IMAGEKIT_URL_ENDPOINT` = `https://ik.imagekit.io/joysfairycharms`
   - `ADMIN_TOKEN` = `pinky_secret_admin_2026`
5. Click **Create Web Service**. Your app will go live with an `https://*.onrender.com` URL!
