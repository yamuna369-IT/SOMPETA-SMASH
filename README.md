# 🏸 Sompeta Smash

A badminton court booking system built with React and Firebase, featuring OTP-based login, membership plans, and an admin dashboard.

---

## 🚀 Features

* 📅 Book courts by date, time, and court
* 👤 Walk-in & Member booking system
* 🔐 OTP-based mobile login (Firebase)
* 📊 Admin dashboard (check-ins, members, courts)
* 💳 Membership plans & usage tracking
* 📱 Responsive user interface

---

## 🛠 Tech Stack

* **Frontend:** React (Vite)
* **Backend/Database:** Firebase (Firestore)
* **Authentication:** Firebase Phone OTP

---

## 📁 Project Structure

```
sompeta-smash/
│
├── public/              # Static files
├── src/
│   ├── App.jsx          # Main application
│   ├── main.jsx         # Entry point
│   ├── firebaseConfig.js# Firebase setup
│   └── (other files)    # Components & logic
│
├── dist/                # Production build
├── package.json         # Dependencies
├── vite.config.js       # Vite configuration
└── README.md
```

---

## ⚙️ Installation & Setup

```bash
# Clone repository
git clone https://github.com/yamuna369-IT/SOMPETA-SMASH.git

# Navigate to project
cd SOMPETA-SMASH

# Install dependencies
npm install

# Run development server
npm run dev
```

---

## 🔐 Firebase Setup

1. Create a project in Firebase Console
2. Enable **Phone Authentication**
3. Add `localhost` in authorized domains
4. Add your Firebase config in `firebaseConfig.js`

---

## 📦 Build

```bash
npm run build
```

---

## 🌐 Deployment

You can deploy using:

* Firebase Hosting
* Netlify
* Vercel

---

## 👩‍💻 Author

**Yamuna Mandala**

---

## 📜 License

This project is open-source and available for learning and development purposes.
