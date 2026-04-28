import React, { useState, useEffect } from "react";
import { db, auth } from "./firebaseConfig";
import { 
  collection, addDoc, query, where, getDocs, doc, updateDoc, 
  onSnapshot, Timestamp 
} from "firebase/firestore";
import { 
  createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  signOut, onAuthStateChanged 
} from "firebase/auth";
import { signInWithPhoneNumber } from "firebase/auth";
import { RecaptchaVerifier } from "firebase/auth";
import { auth } from "./firebaseConfig";




const ADMIN_PIN = "xxxx"; 
const COURTS = [1, 2, 3, 4];
const TIME_SLOTS = [
  { id: "05:00", label: "5:00 AM", period: "morning" },
  { id: "06:00", label: "6:00 AM", period: "morning" },
  { id: "07:00", label: "7:00 AM", period: "morning" },
  { id: "08:00", label: "8:00 AM", period: "day" },
  { id: "09:00", label: "9:00 AM", period: "day" },
  { id: "10:00", label: "10:00 AM", period: "day" },
  { id: "11:00", label: "11:00 AM", period: "day" },
  { id: "12:00", label: "12:00 PM", period: "day" },
  { id: "13:00", label: "1:00 PM", period: "day" },
  { id: "14:00", label: "2:00 PM", period: "day" },
  { id: "15:00", label: "3:00 PM", period: "day" },
  { id: "16:00", label: "4:00 PM", period: "peak" },
  { id: "17:00", label: "5:00 PM", period: "peak" },
  { id: "18:00", label: "6:00 PM", period: "peak" },
  { id: "19:00", label: "7:00 PM", period: "peak" },
  { id: "20:00", label: "8:00 PM", period: "peak" },
];

const PRICES = {
  morning: { member: 80, individual: 130 },
  day: { member: 60, individual: 90 },
  peak: { member: 120, individual: 200 },
};

const PLANS = {
  basic: { name: "Basic", price: 650, slotsPerWeek: 3, color: "#4ade80", desc: "3 sessions/week · 1hr each" },
  standard: { name: "Standard", price: 950, slotsPerWeek: 5, color: "#facc15", desc: "5 sessions/week · 1hr each" },
  premium: { name: "Premium", price: 1450, slotsPerWeek: 99, color: "#f97316", desc: "Unlimited sessions" },
  family: { name: "Family Pack", price: 1800, slotsPerWeek: 99, color: "#a78bfa", desc: "2 adults + 1 child · Unlimited" },
};

const PLAN_ORDER = ["basic", "standard", "premium", "family"];

// Utility functions
function todayStr() { return new Date().toISOString().split("T")[0]; }
function getWeekStart(ds) {
  const d = new Date(ds + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}
function getWeekDates(ws) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
function fmtDate(ds) {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDT(timestamp) {
  const date = timestamp?.toDate?.() || new Date(timestamp);
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function slotPrice(slotId, type) {
  const s = TIME_SLOTS.find(x => x.id === slotId);
  return s ? PRICES[s.period][type] : 0;
}
function genId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {

  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState({});
  const [bookings, setBookings] = useState({});
  const [checkins, setCheckins] = useState([]);
  const [phoneAuth, setPhoneAuth] = useState(false);

  // Phone auth states
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [otpSent, setOtpSent] = useState(false);

  // Auth states
  const [currentUser, setCurrentUser] = useState(null);
  const [authScreen, setAuthScreen] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");

  // Booking states
  const [userType, setUserType] = useState("individual");
  const [selDate, setSelDate] = useState(todayStr());
  const [selCourt, setSelCourt] = useState(null);
  const [selSlot, setSelSlot] = useState(null);
  const [bookForm, setBookForm] = useState({ name: "", phone: "", memberId: "" });
  const [confirmed, setConfirmed] = useState(null);

  // Admin states
  const [adminAuth, setAdminAuth] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [adminTab, setAdminTab] = useState("checkins");
  const [adminDate, setAdminDate] = useState(todayStr());
  const [addForm, setAddForm] = useState({ name: "", phone: "", plan: "basic" });
  const [toast, setToast] = useState(null);

  const showToast = (msg, color = "#00c9a7") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2800);
  };

  //  set up reCAPTCHA
const setupRecaptcha = () => {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
      callback: () => {
        console.log("reCAPTCHA verified");
      },
      "expired-callback": () => {
        window.recaptchaVerifier = null;
      }
    });
  }
};

// Send OTP function
const handleSendOTP = async () => {
  if (!phone) {
    showToast("Please enter phone number", "#ef4444");
    return;
  }
  try {
    setupRecaptcha();
    const appVerifier = window.recaptchaVerifier;
    const result = await signInWithPhoneNumber(auth, phone, appVerifier);
    setConfirmationResult(result);
    setOtpSent(true);
    showToast("OTP sent to your phone", "#00c9a7");
  } catch (error) {
    showToast("Error: " + error.message, "#ef4444");
    window.recaptchaVerifier = null;
  }
};

// Verify OTP function
const handleVerifyOTP = async () => {
  if (!otp || otp.length !== 6) {
    showToast("Please enter valid 6-digit OTP", "#ef4444");
    return;
  }
  try {
    const result = await confirmationResult.confirm(otp);
    const user = result.user;
    
    // Check if user exists in members collection
    const memberRef = doc(db, "members", user.uid);
    const memberSnap = await getDoc(memberRef);
    
    if (!memberSnap.exists()) {
      // Create new member record
      await setDoc(memberRef, {
        id: "MB" + genId(),
        name: "",
        phone: phone,
        email: user.email || "",
        plan: "basic",
        uid: user.uid,
        joinedAt: Timestamp.now(),
        verified: true
      });
    }
    
    setOtpSent(false);
    setOtp("");
    setPhone("");
    setAuthScreen("login");
    showToast("Phone verified! Please complete your profile", "#00c9a7");
  } catch (error) {
    showToast("Invalid OTP: " + error.message, "#ef4444");
  }
};

  // Firebase Auth listener
   useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);


 // Firestore real-time listeners
  
useEffect(() => {
  if (!currentUser) return;

  const unsubMembers = onSnapshot(collection(db, "members"), (snapshot) => {
    const membersData = {};
    snapshot.forEach((doc) => {
      membersData[doc.id] = { docId: doc.id, ...doc.data() };
    });
    setMembers(membersData);
  });

  const unsubBookings = onSnapshot(collection(db, "bookings"), (snapshot) => {
    const bookingsData = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      const key = `${data.date}|${data.court}|${data.slot}`;
      bookingsData[key] = { docId: doc.id, ...data };
    });
    setBookings(bookingsData);
  });

  const unsubCheckins = onSnapshot(collection(db, "checkins"), (snapshot) => {
    const checkinsData = [];
    snapshot.forEach((doc) => {
      checkinsData.push({ docId: doc.id, ...doc.data() });
    });
    setCheckins(checkinsData.sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt)));
  });

  return () => {
    unsubMembers();
    unsubBookings();
    unsubCheckins();
  };
}, [currentUser]);

  // Auth handlers
  const handleSignUp = async () => {
    if (!authEmail || !authPassword || !authName) {
      showToast("Please fill all fields", "#ef4444");
      return;
    }
    try {
      const { user } = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      await addDoc(collection(db, "members"), {
        id: "MB" + genId(),
        name: authName,
        email: authEmail,
        phone: "",
        plan: "basic",
        uid: user.uid,
        joinedAt: Timestamp.now(),
      });
      setAuthEmail("");
      setAuthPassword("");
      setAuthName("");
      setAuthScreen("login");
      showToast("Account created! Please login", "#00c9a7");
    } catch (error) {
      showToast(error.message, "#ef4444");
    }
  };

  const handleLogin = async () => {
    if (!authEmail || !authPassword) {
      showToast("Please enter email and password", "#ef4444");
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      setAuthEmail("");
      setAuthPassword("");
      showToast("Logged in successfully ✓", "#00c9a7");
    } catch (error) {
      showToast(error.message, "#ef4444");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAdminAuth(false);
      setAuthScreen("login");
      showToast("Logged out ✓", "#00c9a7");
    } catch (error) {
      showToast(error.message, "#ef4444");
    }
  };

  // Booking logic
  const bKey = (date, court, slot) => `${date}|${court}|${slot}`;
  const isBooked = (court, slot) => !!bookings[bKey(selDate, court, slot)];

  const weeklyUsed = (memberId, ws) => {
    const days = getWeekDates(ws);
    return Object.values(bookings).filter(b => b.memberId === memberId && days.includes(b.date)).length;
  };

  const handleConfirm = async () => {
    try {
      const id = genId();
      const price = slotPrice(selSlot, userType);
      const rec = {
        id,
        date: selDate,
        court: selCourt,
        slot: selSlot,
        slotLabel: TIME_SLOTS.find(s => s.id === selSlot)?.label,
        name: bookForm.name,
        phone: bookForm.phone,
        memberId: userType === "member" ? bookForm.memberId : null,
        type: userType,
        price,
        bookedAt: Timestamp.now(),
        checkedIn: false,
      };

      await addDoc(collection(db, "bookings"), rec);
      await addDoc(collection(db, "checkins"), rec);

      setConfirmed(rec);
      setSelCourt(null);
      setSelSlot(null);
      setBookForm({ name: "", phone: "", memberId: "" });
      setScreen("success");
      showToast("Booking confirmed! ✓");
    } catch (error) {
      showToast("Booking failed: " + error.message, "#ef4444");
    }
  };

  const toggleCheckin = async (docId) => {
    try {
      const checkinsRef = collection(db, "checkins");
      const q = query(checkinsRef, where("id", "==", docId));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const isCheckedIn = doc.data().checkedIn;
        await updateDoc(doc.ref, {
          checkedIn: !isCheckedIn,
          checkedInAt: !isCheckedIn ? Timestamp.now() : null,
        });
        showToast("Check-in updated ✓");
      }
    } catch (error) {
      showToast("Check-in update failed: " + error.message, "#ef4444");
    }
  };

  const addMember = async () => {
    if (!addForm.name || !addForm.phone) {
      showToast("Please fill all fields", "#ef4444");
      return;
    }
    try {
      await addDoc(collection(db, "members"), {
        id: "MB" + genId(),
        name: addForm.name,
        phone: addForm.phone,
        plan: addForm.plan,
        email: "",
        joinedAt: Timestamp.now(),
      });
      setAddForm({ name: "", phone: "", plan: "basic" });
      showToast("Member created ✓");
    } catch (error) {
      showToast("Failed to create member: " + error.message, "#ef4444");
    }
  };

  const upgradePlan = async (docId, newPlan) => {
    try {
      const memberDoc = doc(db, "members", docId);
      await updateDoc(memberDoc, {
        plan: newPlan,
        upgradedAt: Timestamp.now(),
      });
      showToast("Plan upgrade requested ✓");
    } catch (error) {
      showToast("Upgrade failed: " + error.message, "#ef4444");
    }
  };

  const allDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const todayCIs = checkins.filter(c => c.date === adminDate);

  const inp = (val, onChange, ph, type = "text") => (
    <input
      type={type}
      placeholder={ph}
      value={val}
      onChange={e => onChange(e.target.value)}
      style={{
        background: "#0d1526",
        border: "1px solid #1e2d4a",
        borderRadius: 9,
        padding: "12px 14px",
        color: "#dde3f0",
        fontSize: 14,
        width: "100%",
        fontFamily: "inherit",
      }}
    />
  );

  const navItems = [
    { id: "home", label: "Home" },
    { id: "book", label: "Book Court" },
    { id: "member-portal", label: "My Card" },
    { id: "memberships", label: "Plans" },
    { id: adminAuth ? "admin" : "admin-gate", label: "⚙ Admin" },
  ];

  // AUTH SCREEN
  if (!currentUser && !loading) {
    return (
      
      <div style={{ minHeight: "100vh", background: "#080c18", color: "#dde3f0", fontFamily: "'DM Sans',system-ui,sans-serif", overflowX: "hidden" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
          *{box-sizing:border-box;margin:0;padding:0}
          ::-webkit-scrollbar{width:3px;height:3px}::-webkit-scrollbar-track{background:#080c18}::-webkit-scrollbar-thumb{background:#1e2d4a;border-radius:4px}
          .btn{transition:all .15s;cursor:pointer;font-family:'DM Sans',sans-serif}
          .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}.btn:active{transform:scale(.97)}
          .fade{animation:fi .28s ease}@keyframes fi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        `}</style>

        <nav style={{ position: "sticky", top: 0, zIndex: 200, background: "rgba(8,12,24,.97)", backdropFilter: "blur(16px)", borderBottom: "1px solid #141e35", padding: "0 14px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", height: 56, display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 22 }}>🏸</span>
              <div>
                <div style={{ fontFamily: "'Syne'", fontSize: 16, fontWeight: 800, color: "#00c9a7", letterSpacing: 1.5 }}>SOMPETA SMASH</div>
                <div style={{ fontSize: 9, color: "#2a3a5a", letterSpacing: 2 }}>BADMINTON ACADEMY</div>
              </div>
            </div>
          </div>
        </nav>

        <div style={{ paddingTop: 56, maxWidth: 380, margin: "0 auto", padding: "60px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 44 }}>🏸</div>
            <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, marginTop: 14, color: "#00c9a7" }}>SOMPETA SMASH</div>
            <p style={{ color: "#5a7090", fontSize: 12, marginTop: 6 }}>Book your court • Play your game</p>
          </div>

          {authScreen === "login" && (
            <div>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18, marginBottom: 20 }}>
      LOGIN
    </div>
    
    {/* Email/Password Tab */}
    <div style={{ display: "flex", gap: 8, marginBottom: 16, background: "#0d1526", borderRadius: 9, padding: 3, border: "1px solid #141e35" }}>
      <button onClick={() => setPhoneAuth(false)} style={{ background: !phoneAuth ? "#00c9a7" : "transparent", color: !phoneAuth ? "#080c18" : "#5a7090", border: "none", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer", flex: 1 }}>
        📧 Email
      </button>
      <button onClick={() => setPhoneAuth(true)} style={{ background: phoneAuth ? "#00c9a7" : "transparent", color: phoneAuth ? "#080c18" : "#5a7090", border: "none", borderRadius: 7, padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer", flex: 1 }}>
        📱 Phone
      </button>
    </div>

    {!phoneAuth ? (
      /* Email/Password login */
      <>
        {inp(authEmail, setAuthEmail, "Email address", "email")}
        <div style={{ marginTop: 11 }}>{inp(authPassword, setAuthPassword, "Password", "password")}</div>
        <button onClick={handleLogin} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>
          Sign In
        </button>
      </>
    ) : (
      /* Phone OTP login */
      <>
        {!otpSent ? (
          <>
            {inp(phone, setPhone, "+91 Your Phone Number", "tel")}
            <button onClick={handleSendOTP} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>
              Send OTP
            </button>
          </>
        ) : (
          <>
            {inp(otp, setOtp, "Enter 6-digit OTP", "text")}
            <button onClick={handleVerifyOTP} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>
              Verify OTP
            </button>
            <button onClick={() => setOtpSent(false)} style={{ background: "transparent", border: "1px solid #1e2d4a", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, marginTop: 8, cursor: "pointer", color: "#5a7090" }}>
              Change Phone
            </button>
          </>
        )}
      </>
    )}

    <div id="recaptcha-container"></div>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18, marginBottom: 20 }}>LOGIN</div>
              {inp(authEmail, setAuthEmail, "Email address", "email")}
              <div style={{ marginTop: 11 }}>{inp(authPassword, setAuthPassword, "Password", "password")}</div>
              <button onClick={handleLogin} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>
                Sign In
              </button>
              <p style={{ textAlign: "center", color: "#5a7090", fontSize: 12, marginTop: 16 }}>
                Don't have an account?{" "}
                <button onClick={() => setAuthScreen("signup")} style={{ background: "none", border: "none", color: "#00c9a7", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                  Sign Up
                </button>
              </p>
            </div>
          )}

          {authScreen === "signup" && (
            <div>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18, marginBottom: 20 }}>CREATE ACCOUNT</div>
              {inp(authName, setAuthName, "Full Name", "text")}
              <div style={{ marginTop: 11 }}>{inp(authEmail, setAuthEmail, "Email address", "email")}</div>
              <div style={{ marginTop: 11 }}>{inp(authPassword, setAuthPassword, "Password (min 6 chars)", "password")}</div>
              <button onClick={handleSignUp} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, marginTop: 18, cursor: "pointer" }}>
                Create Account
              </button>
              <p style={{ textAlign: "center", color: "#5a7090", fontSize: 12, marginTop: 16 }}>
                Already have an account?{" "}
                <button onClick={() => setAuthScreen("login")} style={{ background: "none", border: "none", color: "#00c9a7", cursor: "pointer", fontWeight: 700, padding: 0 }}>
                  Sign In
                </button>
              </p>
            </div>
          )}

          {toast && (
            <div style={{ position: "fixed", top: 70, right: 16, zIndex: 999, background: toast.color, color: "#080c18", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div style={{ minHeight: "100vh", background: "#080c18", color: "#dde3f0", fontFamily: "'DM Sans',system-ui,sans-serif", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#080c18}::-webkit-scrollbar-thumb{background:#1e2d4a;border-radius:4px}
        .btn{transition:all .15s;cursor:pointer}
        .btn:hover{filter:brightness(1.12);transform:translateY(-1px)}.btn:active{transform:scale(.97)}
        .fade{animation:fi .28s ease}@keyframes fi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        .slot{transition:all .15s;cursor:pointer}.slot:hover:not([disabled]){transform:scale(1.1)}
        input,select{outline:none}input:focus,select:focus{border-color:#00c9a7!important}
        .card-hover{transition:transform .2s}.card-hover:hover{transform:translateY(-3px)}
        .toast{animation:toastin .3s ease}@keyframes toastin{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 70, right: 16, zIndex: 999, background: toast.color, color: "#080c18", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
          {toast.msg}
        </div>
      )}

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 200, background: "rgba(8,12,24,.97)", backdropFilter: "blur(16px)", borderBottom: "1px solid #141e35", padding: "0 14px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div onClick={() => setScreen("home")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 22 }}>🏸</span>
            <div>
              <div style={{ fontFamily: "'Syne'", fontSize: 16, fontWeight: 800, color: "#00c9a7", letterSpacing: 1.5 }}>SOMPETA SMASH</div>
              <div style={{ fontSize: 9, color: "#2a3a5a", letterSpacing: 2 }}>BADMINTON ACADEMY</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            {navItems.map(n => (
              <button key={n.id} onClick={() => setScreen(n.id)} style={{ background: screen === n.id || (screen === "admin" && n.label.includes("Admin")) ? "#00c9a7" : "transparent", color: screen === n.id || (screen === "admin" && n.label.includes("Admin")) ? "#080c18" : "#5a7090", border: "none", borderRadius: 7, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {n.label}
              </button>
            ))}
            <button onClick={handleLogout} style={{ background: "transparent", color: "#5a7090", border: "1px solid #1e2d4a", borderRadius: 7, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#3a5070" }}>
          <div style={{ fontSize: 40, animation: "spin 1s linear infinite" }}>🏸</div>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          <div style={{ marginTop: 12, fontSize: 13 }}>Loading data...</div>
        </div>
      )}

      {!loading && (
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 14px 60px" }}>
          {/* HOME */}
          {screen === "home" && (
            <div className="fade">
              <div style={{ textAlign: "center", padding: "48px 16px 32px", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 500, height: 320, background: "radial-gradient(ellipse,rgba(0,201,167,.07) 0%,transparent 65%)", pointerEvents: "none" }} />
                <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: "clamp(38px,9vw,70px)", lineHeight: 1, letterSpacing: 2 }}>
                  PLAY YOUR<br /><span style={{ color: "#00c9a7" }}>BEST GAME</span>
                </div>
                <p style={{ color: "#5a7090", marginTop: 12, fontSize: 14, maxWidth: 360, margin: "12px auto 0" }}>4 premium courts · Professional LED lighting · Cash at counter</p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
                  <button onClick={() => setScreen("book")} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 11, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Book a Court →
                  </button>
                  <button onClick={() => setScreen("memberships")} style={{ background: "transparent", color: "#00c9a7", border: "1.5px solid #00c9a7", borderRadius: 11, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    View Plans
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 32 }}>
                {[["🏟️", "4 Courts", "Always available"], ["💵", "Cash Only", "Pay at counter"], ["🕐", "5AM–9PM", "Open daily"]].map(([ic, v, s], i) => (
                  <div key={i} style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 13, padding: "18px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 24 }}>{ic}</div>
                    <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18, color: "#00c9a7", marginTop: 6 }}>{v}</div>
                    <div style={{ color: "#3a5070", fontSize: 11, marginTop: 3 }}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 16, padding: 22, marginBottom: 32 }}>
                <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18, letterSpacing: 1, marginBottom: 16 }}>COURT RATES</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {["SLOT", "MEMBER", "WALK-IN"].map((h, i) => (
                    <div key={i} style={{ padding: "7px 0", borderBottom: "1px solid #141e35", fontSize: 10, fontWeight: 700, letterSpacing: 1, color: i === 0 ? "#3a5070" : i === 1 ? "#00c9a7" : "#7a90b0" }}>
                      {h}
                    </div>
                  ))}
                  {[["Morning 5–8 AM", "₹80", "₹130"], ["Day 8 AM–4 PM", "₹60", "₹90"], ["⚡ Peak 4–9 PM", "₹120", "₹200"]].map(([a, b, c], i) => (
                    <>
  <div style={{ padding: "11px 0", borderBottom: "1px solid #0c1220", fontSize: 12, color: "#b0bcd0" }}>{a}</div>
  <div style={{ padding: "11px 0", borderBottom: "1px solid #0c1220", fontWeight: 700, color: "#00c9a7", fontSize: 14 }}>{b}</div>
  <div style={{ padding: "11px 0", borderBottom: "1px solid #0c1220", fontWeight: 700, color: "#dde3f0", fontSize: 14 }}>{c}</div>
</>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: "10px 14px", background: "#080c18", borderRadius: 9, fontSize: 12, color: "#3a5070", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 15 }}>💵</span> All payments are <strong style={{ color: "#facc15", marginLeft: 4 }}>cash only</strong> at the counter.
                </div>
              </div>
            </div>
          )}

          {/* BOOK */}
          {screen === "book" && (
            <div className="fade" style={{ paddingTop: 22 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, letterSpacing: 1, marginBottom: 3 }}>BOOK A COURT</div>
              <p style={{ color: "#5a7090", fontSize: 12, marginBottom: 18 }}>Select date, court, and time. Pay cash at counter on arrival.</p>
              <div style={{ display: "flex", background: "#0d1526", borderRadius: 9, padding: 3, width: "fit-content", marginBottom: 20, border: "1px solid #141e35" }}>
                {[{ id: "individual", label: "👤 Walk-in" }, { id: "member", label: "⭐ Member" }].map(t => (
                  <button key={t.id} onClick={() => setUserType(t.id)} style={{ background: userType === t.id ? "#00c9a7" : "transparent", color: userType === t.id ? "#080c18" : "#5a7090", border: "none", borderRadius: 7, padding: "7px 17px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "#3a5070", fontWeight: 700, letterSpacing: 1.5, marginBottom: 7 }}>SELECT DATE</div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {allDates.map(d => (
                    <button key={d} onClick={() => setSelDate(d)} style={{ background: selDate === d ? "#00c9a7" : "#0d1526", color: selDate === d ? "#080c18" : "#5a7090", border: `1px solid ${selDate === d ? "#00c9a7" : "#141e35"}`, borderRadius: 8, padding: "8px 12px", whiteSpace: "nowrap", fontSize: 11, fontWeight: 600, minWidth: 66, cursor: "pointer" }}>
                      {fmtDate(d)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: "#3a5070", fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>COURT & TIME SLOT</div>
                <div style={{ display: "flex", gap: 10, marginBottom: 9, flexWrap: "wrap" }}>
                  {[{ bg: "#0d1526", border: "#1e2d4a", label: "Available" }, { bg: "#00c9a7", border: "#00c9a7", label: "Selected" }, { bg: "#0a0f1e", border: "#0f1a30", label: "Booked" }].map((l, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#5a7090" }}>
                      <div style={{ width: 13, height: 13, background: l.bg, border: `1.5px solid ${l.border}`, borderRadius: 3 }} />
                      {l.label}
                    </div>
                  ))}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: 560, width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "6px 9px", color: "#3a5070", fontSize: 10, textAlign: "left", fontWeight: 700 }}>TIME</th>
                        {COURTS.map(c => (
                          <th key={c} style={{ padding: "6px 9px", color: "#00c9a7", fontSize: 10, fontWeight: 700, textAlign: "center" }}>
                            Court {c}
                          </th>
                        ))}
                        <th style={{ padding: "6px 9px", color: "#3a5070", fontSize: 10, fontWeight: 700 }}>RATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TIME_SLOTS.map(slot => (
                        <tr key={slot.id} style={{ borderTop: "1px solid #0c1220" }}>
                          <td style={{ padding: "6px 9px", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#b0bcd0" }}>{slot.label}</div>
                            <div style={{ fontSize: 9, color: slot.period === "peak" ? "#f97316" : "#3a5070", fontWeight: 700, letterSpacing: .5 }}>
                              {slot.period === "peak" ? "⚡PEAK" : slot.period === "morning" ? "MORNING" : "DAYTIME"}
                            </div>
                          </td>
                          {COURTS.map(court => {
                            const booked = isBooked(court, slot.id);
                            const sel = selCourt === court && selSlot === slot.id;
                            return (
                              <td key={court} style={{ padding: "4px 6px", textAlign: "center" }}>
                                <button
                                  disabled={booked}
                                  onClick={() => {
                                    if (!booked) {
                                      setSelCourt(court);
                                      setSelSlot(slot.id);
                                    }
                                  }}
                                  style={{
                                    width: 38,
                                    height: 30,
                                    borderRadius: 6,
                                    background: booked ? "#0a0f1e" : sel ? "#00c9a7" : "#0d1526",
                                    border: `1.5px solid ${booked ? "#0f1a30" : sel ? "#00c9a7" : "#1e2d4a"}`,
                                    color: booked ? "#1e2d4a" : sel ? "#080c18" : "#5a7090",
                                    fontSize: 12,
                                    cursor: booked ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {booked ? "✕" : sel ? "✓" : ""}
                                </button>
                              </td>
                            );
                          })}
                          <td style={{ padding: "6px 9px", whiteSpace: "nowrap" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: slot.period === "peak" ? "#f97316" : "#00c9a7" }}>
                              ₹{PRICES[slot.period][userType]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {selCourt && selSlot && (
                <div className="fade" style={{ background: "#0d1526", border: "1px solid #00c9a7", borderRadius: 13, padding: "14px 18px", marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, boxShadow: "0 0 18px rgba(0,201,167,.12)" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#3a5070", marginBottom: 2 }}>SELECTED</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      Court {selCourt} · {TIME_SLOTS.find(s => s.id === selSlot)?.label} · {fmtDate(selDate)}
                    </div>
                    <div style={{ color: "#00c9a7", fontSize: 12, marginTop: 2 }}>
                      ₹{slotPrice(selSlot, userType)} — {userType === "member" ? "⭐ Member" : "👤 Walk-in"} · Cash at counter
                    </div>
                  </div>
                  <button onClick={() => setScreen("book-confirm")} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Proceed →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* BOOK CONFIRM */}
          {screen === "book-confirm" && (
            <div className="fade" style={{ paddingTop: 26, maxWidth: 440, margin: "0 auto" }}>
              <button onClick={() => setScreen("book")} style={{ background: "none", border: "none", color: "#5a7090", fontSize: 13, marginBottom: 18, cursor: "pointer" }}>
                ← Back
              </button>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 24, letterSpacing: 1, marginBottom: 20 }}>
                CONFIRM BOOKING
              </div>
              <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 13, padding: 20, marginBottom: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                  {[
                    ["Court", `Court ${selCourt}`],
                    ["Date", fmtDate(selDate)],
                    ["Time", TIME_SLOTS.find(s => s.id === selSlot)?.label],
                    ["Amount", `₹${slotPrice(selSlot, userType)}`],
                  ].map(([l, v], i) => (
                    <div key={i}>
                      <div style={{ fontSize: 9, color: "#3a5070", fontWeight: 700, letterSpacing: 1 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: i === 3 ? "#facc15" : "#dde3f0" }}>
                        {v}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 13, padding: "9px 12px", background: "#080c18", borderRadius: 8, fontSize: 11, color: "#5a7090" }}>
                  💵 Pay <strong style={{ color: "#facc15" }}>₹{slotPrice(selSlot, userType)}</strong> cash at counter before playing. No online payment.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                {[
                  { key: "name", ph: "Full Name *", type: "text" },
                  { key: "phone", ph: "Phone Number *", type: "tel" },
                  ...(userType === "member" ? [{ key: "memberId", ph: "Member ID (e.g. MB3X7F2A)", type: "text" }] : []),
                ].map(f => (
                  <input
                    key={f.key}
                    type={f.type}
                    placeholder={f.ph}
                    value={bookForm[f.key]}
                    onChange={e => setBookForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ background: "#0d1526", border: "1px solid #1e2d4a", borderRadius: 9, padding: "12px 13px", color: "#dde3f0", fontSize: 14 }}
                  />
                ))}
              </div>
              <button
                disabled={!bookForm.name || !bookForm.phone}
                onClick={handleConfirm}
                style={{
                  background: bookForm.name && bookForm.phone ? "#00c9a7" : "#141e35",
                  color: bookForm.name && bookForm.phone ? "#080c18" : "#3a5070",
                  border: "none",
                  borderRadius: 11,
                  padding: 14,
                  width: "100%",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: bookForm.name && bookForm.phone ? "pointer" : "not-allowed",
                }}
              >
                Confirm Booking (Cash ₹{slotPrice(selSlot, userType)})
              </button>
            </div>
          )}

          {/* SUCCESS */}
          {screen === "success" && confirmed && (
            <div className="fade" style={{ textAlign: "center", paddingTop: 48, maxWidth: 400, margin: "0 auto" }}>
              <div style={{ fontSize: 52 }}>🎉</div>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 34, color: "#00c9a7", letterSpacing: 2, marginTop: 8 }}>
                BOOKED!
              </div>
              <p style={{ color: "#5a7090", marginTop: 5, marginBottom: 26 }}>
                See you on the court, {confirmed.name}!
              </p>
              <div style={{ background: "#0d1526", border: "1px solid #00c9a7", borderRadius: 16, padding: 22, textAlign: "left", marginBottom: 22, boxShadow: "0 0 18px rgba(0,201,167,.1)" }}>
                <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 14, color: "#00c9a7", marginBottom: 13 }}>
                  BOOKING RECEIPT
                </div>
                {[
                  ["Booking ID", confirmed.id],
                  ["Court", `Court ${confirmed.court}`],
                  ["Date", fmtDate(confirmed.date)],
                  ["Time", confirmed.slotLabel],
                  ["Name", confirmed.name],
                  ["Phone", confirmed.phone],
                  ["Cash Due", `₹${confirmed.price} at counter`],
                ].map(([l, v], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #141e35" }}>
                    <span style={{ color: "#3a5070", fontSize: 11 }}>{l}</span>
                    <span style={{ fontWeight: 700, fontSize: 12, color: i === 6 ? "#facc15" : "#dde3f0" }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
                <button onClick={() => setScreen("book")} style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 10, padding: "11px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Book Another
                </button>
                <button onClick={() => setScreen("home")} style={{ background: "transparent", color: "#5a7090", border: "1px solid #1e2d4a", borderRadius: 10, padding: "11px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Home
                </button>
              </div>
            </div>
          )}

        {/* MEMBER PORTAL */}
                 
          {screen === "member-portal" && (
            <div className="fade" style={{ paddingTop: 22 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, letterSpacing: 1, marginBottom: 3 }}>
                MY MEMBERSHIP CARD
              </div>
              <p style={{ color: "#5a7090", fontSize: 12, marginBottom: 22 }}>
                View your bookings, membership details, and payment history.
              </p>

              {currentUser &&
               Object.values(members).find(m => m.email === currentUser.email) &&
               (() => {
                  const member = Object.values(members).find(m => m.email === currentUser.email);
                  const plan = PLANS[member.plan] || PLANS.basic;
                  const ws = getWeekStart(todayStr());
                  const used = weeklyUsed(member.id, ws);
                  const rem = plan.slotsPerWeek === 99 ? "∞" : Math.max(0, plan.slotsPerWeek - used);
                 const weekDays = getWeekDates(ws);
        
                 // Get all bookings for this member
                 const thisWeek = Object.values(bookings).filter(
                  b => b.memberId === member.id && weekDays.includes(b.date)
               );
                const upcomingBookings = Object.values(bookings).filter(
                    b => b.memberId === member.id && new Date(b.date) >= new Date(todayStr())
                   ).sort((a, b) => new Date(a.date) - new Date(b.date));
        
                const history = Object.values(bookings)
                   .filter(b => b.memberId === member.id)
                   .sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt));

                    // Calculate membership stats
                 const joinDate = member.joinedAt?.toDate?.() || new Date(member.joinedAt);
                 const totalBookings = Object.values(bookings).filter(b => b.memberId === member.id).length;
                 const totalSpent = Object.values(bookings)
                 .filter(b => b.memberId === member.id)
                 .reduce((sum, b) => sum + (b.price || 0), 0);

                return (
             <div>
            {/* Main Membership Card */}
            <div style={{
              background: `linear-gradient(135deg,#0d1526 0%,#101d34 100%)`,
              border: `1.5px solid ${plan.color}40`,
              borderRadius: 18,
              padding: 26,
              marginBottom: 20,
              position: "relative",
              overflow: "hidden",
              boxShadow: `0 0 28px ${plan.color}12`
            }}>
              <div style={{
                position: "absolute",
                top: -25,
                right: -25,
                width: 140,
                height: 140,
                background: `radial-gradient(circle,${plan.color}15,transparent 70%)`
              }}/>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#3a5070", fontWeight: 700, letterSpacing: 2, marginBottom: 5 }}>
                    MEMBER SINCE {new Date(joinDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                  </div>
                  <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, color: "#fff" }}>
                    {member.name}
                  </div>
                  <div style={{ color: "#5a7090", fontSize: 12, marginTop: 2 }}>
                    {member.email || member.phone}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ background: `${plan.color}20`, border: `1px solid ${plan.color}50`, borderRadius: 9, padding: "5px 13px", display: "inline-block" }}>
                    <span style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 14, color: plan.color }}>
                      {plan.name.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10, color: "#3a5070" }}>
                    ID: {member.id}
                  </div>
                </div>
              </div>

              {/* Membership Stats */}
              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  ["USED THIS WEEK", used, "#f97316"],
                  ["REMAINING", rem, "#00c9a7"],
                  ["WEEKLY LIMIT", plan.slotsPerWeek === 99 ? "∞" : plan.slotsPerWeek, plan.color],
                ].map(([l, v, c], i) => (
                  <div key={i} style={{ background: "#080c18", borderRadius: 9, padding: 13, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, color: c }}>
                      {v}
                    </div>
                    <div style={{ fontSize: 8, color: "#3a5070", fontWeight: 700, letterSpacing: 0.8, marginTop: 3 }}>
                      {l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Membership Details Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
              {[
                ["📅 PLAN COST", `₹${plan.price}/mo`, "#facc15"],
                ["🎯 TOTAL BOOKINGS", totalBookings, "#00c9a7"],
                ["💰 TOTAL SPENT", `₹${totalSpent}`, "#a78bfa"],
                ["⏱ DAYS ACTIVE", Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24)), "#4ade80"],
              ].map(([label, value, color], i) => (
                <div key={i} style={{
                  background: "#0d1526",
                  border: "1px solid #141e35",
                  borderRadius: 11,
                  padding: 14,
                  textAlign: "center"
                }}>
                  <div style={{ fontSize: 14 }}>{label.split(' ')[0]}</div>
                  <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 18, color: color, marginTop: 6 }}>
                    {value}
                  </div>
                  <div style={{ fontSize: 8, color: "#3a5070", marginTop: 4 }}>
                    {label.split(' ').slice(1).join(' ')}
                  </div>
                </div>
              ))}
            </div>

            {/* Upcoming Bookings */}
            <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                📋 UPCOMING BOOKINGS
                <span style={{ fontSize: 11, fontWeight: 400, color: "#3a5070" }}>
                  ({upcomingBookings.length})
                </span>
              </div>
              {upcomingBookings.length === 0 ? (
                <div style={{ color: "#3a5070", fontSize: 13, textAlign: "center", padding: "18px 0" }}>
                  No upcoming bookings. <button onClick={() => setScreen("book")} style={{ background: "none", border: "none", color: "#00c9a7", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>Book now</button>
                </div>
              ) : (
                upcomingBookings.slice(0, 5).map((b, i) => (
                  <div key={i} style={{
                    background: "#080c18",
                    borderRadius: 9,
                    padding: "12px 14px",
                    marginBottom: 8,
                    border: "1px solid #1e2d4a",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#00c9a7" }}>
                        🏸 Court {b.court} · {b.slotLabel}
                      </div>
                      <div style={{ fontSize: 11, color: "#5a7090", marginTop: 2 }}>
                        📅 {fmtDate(b.date)} · Booked on {fmtDT(b.bookedAt)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: b.checkedIn ? "#4ade80" : "#f97316" }}>
                        {b.checkedIn ? "✓ CHECKED IN" : "⏳ PENDING"}
                      </div>
                      <div style={{ fontSize: 12, color: "#facc15", fontWeight: 700, marginTop: 2 }}>
                        ₹{b.price}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* This Week's Bookings */}
            <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                📊 THIS WEEK'S BOOKINGS
                <span style={{ fontSize: 11, fontWeight: 400, color: "#3a5070" }}>
                  ({thisWeek.length}/{plan.slotsPerWeek === 99 ? "∞" : plan.slotsPerWeek})
                </span>
              </div>
              {thisWeek.length === 0 ? (
                <div style={{ color: "#3a5070", fontSize: 13, textAlign: "center", padding: "18px 0" }}>
                  No bookings this week yet
                </div>
              ) : (
                thisWeek.map((b, i) => (
                  <div key={i} style={{
                    background: "#080c18",
                    borderRadius: 9,
                    padding: "11px 14px",
                    marginBottom: 6,
                    border: `1px solid ${b.checkedIn ? "#4ade8030" : "#1e2d4a"}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 6
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>
                        Court {b.court} · {b.slotLabel}
                      </div>
                      <div style={{ fontSize: 10, color: "#3a5070" }}>
                        {fmtDate(b.date)} · Booked {fmtDT(b.bookedAt)}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: b.checkedIn ? "#4ade80" : "#5a7090", fontWeight: 700 }}>
                      {b.checkedIn ? "✓ Checked In" : "⏳ Pending"}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Complete Booking History */}
            <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                📈 BOOKING HISTORY
                <span style={{ fontSize: 11, fontWeight: 400, color: "#3a5070" }}>
                  ({history.length} total)
                </span>
              </div>
              {history.length === 0 ? (
                <div style={{ color: "#3a5070", fontSize: 13, textAlign: "center", padding: "18px 0" }}>
                  No bookings yet
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {history.map((b, i) => (
                    <div key={i} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: i !== history.length - 1 ? "1px solid #0c1220" : "none",
                      flexWrap: "wrap",
                      gap: 6,
                      alignItems: "center"
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          Court {b.court} · {b.slotLabel}
                        </div>
                        <div style={{ fontSize: 10, color: "#3a5070" }}>
                          {fmtDate(b.date)} at {fmtDT(b.bookedAt)}
                        </div>
                        <div style={{ fontSize: 9, color: "#5a7090", marginTop: 2 }}>
                          {b.checkedIn ? "✓ Attended" : "○ Not attended"}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: "#facc15", fontWeight: 700 }}>
                        ₹{b.price}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Membership Plan Details */}
            <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 14 }}>
                🎯 YOUR PLAN DETAILS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  ["Plan Name", plan.name, plan.color],
                  ["Monthly Cost", `₹${plan.price}`, "#facc15"],
                  ["Sessions/Week", plan.slotsPerWeek === 99 ? "Unlimited" : plan.slotsPerWeek, "#00c9a7"],
                  ["Duration", "1 hour each", "#7a90b0"],
                  ["Plan Description", plan.desc, "#5a7090"],
                  ["Payment Method", "Cash at counter", "#4ade80"],
                ].map(([label, value, color], i) => (
                  <div key={i} style={{ background: "#080c18", borderRadius: 9, padding: 12 }}>
                    <div style={{ fontSize: 9, color: "#3a5070", fontWeight: 700, letterSpacing: 0.5 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color, marginTop: 6 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 20 }}>
              <button onClick={() => setScreen("book")} style={{
                background: "#00c9a7",
                color: "#080c18",
                border: "none",
                borderRadius: 11,
                padding: "12px 24px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer"
              }}>
                📅 Book Next Session
              </button>
              <button onClick={() => setScreen("memberships")} style={{
                background: "transparent",
                color: "#00c9a7",
                border: "1.5px solid #00c9a7",
                borderRadius: 11,
                padding: "12px 24px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer"
              }}>
                📦 View Other Plans
              </button>
            </div>
          </div>
        );
      })()}
  </div>
    )}

          {/* MEMBERSHIPS */}
          {screen === "memberships" && (
            <div className="fade" style={{ paddingTop: 22 }}>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, letterSpacing: 1, marginBottom: 3 }}>
                MEMBERSHIP PLANS
              </div>
              <p style={{ color: "#5a7090", fontSize: 12, marginBottom: 26 }}>
                Save up to 40% vs walk-in rates. Pay monthly at counter in cash.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(195px,1fr))", gap: 14, marginBottom: 36 }}>
                {PLAN_ORDER.map(pid => {
                  const p = PLANS[pid];
                  return (
                    <div key={pid} className="card-hover" style={{ background: "#0d1526", border: `1.5px solid ${p.color}30`, borderRadius: 16, padding: 22, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: -18, right: -18, width: 90, height: 90, background: `radial-gradient(circle,${p.color}15,transparent 70%)` }} />
                      <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 12, color: p.color, letterSpacing: 2, marginBottom: 7 }}>
                        {p.name.toUpperCase()}
                      </div>
                      <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 36, color: "#fff" }}>
                        ₹{p.price}
                      </div>
                      <div style={{ fontSize: 10, color: "#3a5070", marginBottom: 10 }}>per month · cash only</div>
                      <div style={{ fontSize: 12, color: "#7a90b0", marginBottom: 16 }}>{p.desc}</div>
                      <div style={{ fontSize: 11, color: "#3a5070", marginBottom: 16 }}>
                        {p.slotsPerWeek === 99 ? "♾ Unlimited sessions/week" : `${p.slotsPerWeek} sessions/week`}
                      </div>
                      <button onClick={() => setScreen("book")} style={{ background: p.color, color: "#080c18", border: "none", borderRadius: 9, padding: "9px 0", fontSize: 12, fontWeight: 700, width: "100%", cursor: "pointer" }}>
                        Book Now
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ADMIN GATE */}
          {screen === "admin-gate" && (
            <div className="fade" style={{ paddingTop: 56, maxWidth: 320, margin: "0 auto", textAlign: "center" }}>
              <div style={{ fontSize: 44 }}>🔐</div>
              <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 24, marginTop: 14, marginBottom: 5 }}>
                ADMIN ACCESS
              </div>
              <p style={{ color: "#5a7090", fontSize: 12, marginBottom: 22 }}>Enter your 4-digit PIN to continue</p>
              <input
                type="password"
                placeholder="••••"
                maxLength={4}
                value={adminPin}
                onChange={e => setAdminPin(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (adminPin === ADMIN_PIN) {
                      setAdminAuth(true);
                      setScreen("admin");
                      setAdminPin("");
                    } else {
                      showToast("Incorrect PIN", "#ef4444");
                      setAdminPin("");
                    }
                  }
                }}
                style={{ background: "#0d1526", border: "1px solid #1e2d4a", borderRadius: 9, padding: 14, color: "#dde3f0", fontSize: 22, textAlign: "center", width: "100%", marginBottom: 12, letterSpacing: 8 }}
              />
              <button
                onClick={() => {
                  if (adminPin === ADMIN_PIN) {
                    setAdminAuth(true);
                    setScreen("admin");
                    setAdminPin("");
                  } else {
                    showToast("Incorrect PIN", "#ef4444");
                    setAdminPin("");
                  }
                }}
                style={{ background: "#00c9a7", color: "#080c18", border: "none", borderRadius: 9, padding: 13, width: "100%", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Enter Admin Panel
              </button>
            </div>
          )}

          {/* ADMIN DASHBOARD */}
          {screen === "admin" && adminAuth && (
            <div className="fade" style={{ paddingTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 24, letterSpacing: 1 }}>
                    ADMIN DASHBOARD
                  </div>
                  <div style={{ fontSize: 11, color: "#3a5070" }}>Sompeta Smash · Live Firestore data</div>
                </div>
                <button onClick={() => { setAdminAuth(false); setScreen("home"); }} style={{ background: "#141e35", color: "#5a7090", border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  Logout
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 20 }}>
                {[
  { label: "Total Members", val: Object.keys(members).length, icon: "⭐", color: "#facc15" },
  { label: "Today's Bookings", val: checkins.filter(c => c.date === todayStr()).length, icon: "📋", color: "#00c9a7" },
  { label: "Checked In Today", val: checkins.filter(c => c.date === todayStr() && c.checkedIn).length, icon: "✅", color: "#4ade80" },
  { label: "All Time Bookings", val: checkins.length, icon: "🏸", color: "#a78bfa" },
].map((s, i) => (
  <div key={i} style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 11, padding: 14 }}>
    <div style={{ fontSize: 20 }}>{s.icon}</div>
    <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 26, color: s.color, marginTop: 5 }}>
      {s.val}
    </div>
    <div style={{ fontSize: 9, color: "#3a5070", marginTop: 2 }}>{s.label}</div>
  </div>
))}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 3, marginBottom: 18, background: "#0d1526", borderRadius: 9, padding: 3, border: "1px solid #141e35", width: "fit-content", flexWrap: "wrap" }}>
                {[
                  { id: "checkins", label: "Check-ins" },
                  { id: "members", label: "Members" },
                  { id: "add-member", label: "+ Add Member" },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setAdminTab(t.id)}
                    style={{
                      background: adminTab === t.id ? "#00c9a7" : "transparent",
                      color: adminTab === t.id ? "#080c18" : "#5a7090",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 13px",
                      fontWeight: 700,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* CHECK-INS TAB */}
              {adminTab === "checkins" && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "#3a5070", fontWeight: 700, letterSpacing: 1.5, marginBottom: 7 }}>
                      DATE
                    </div>
                    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                      {allDates.slice(0, 7).map(d => (
                        <button
                          key={d}
                          onClick={() => setAdminDate(d)}
                          style={{
                            background: adminDate === d ? "#00c9a7" : "#0d1526",
                            color: adminDate === d ? "#080c18" : "#5a7090",
                            border: `1px solid ${adminDate === d ? "#00c9a7" : "#141e35"}`,
                            borderRadius: 8,
                            padding: "7px 11px",
                            whiteSpace: "nowrap",
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {fmtDate(d)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 13, padding: 18 }}>
                    <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
                      BOOKINGS — {fmtDate(adminDate)}
                      <span style={{ fontSize: 11, fontWeight: 400, color: "#3a5070", marginLeft: 8 }}>
                        {todayCIs.length} total · {todayCIs.filter(c => c.checkedIn).length} checked in
                      </span>
                    </div>
                    {todayCIs.length === 0 ? (
                      <div style={{ color: "#3a5070", textAlign: "center", padding: "26px 0", fontSize: 13 }}>
                        No bookings for {fmtDate(adminDate)}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {todayCIs.map((c, i) => (
                          <div
                            key={i}
                            style={{
                              background: "#080c18",
                              borderRadius: 9,
                              padding: "11px 14px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 7,
                              border: `1px solid ${c.checkedIn ? "#00c9a2040" : "#141e35"}`,
                            }}
                          >
                            <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                              <div style={{ background: "#141e35", borderRadius: 6, padding: "4px 9px", fontSize: 10, fontWeight: 700, color: "#00c9a7", whiteSpace: "nowrap" }}>
                                C{c.court}·{c.slotLabel}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: "#3a5070" }}>
                                  {c.phone} · {c.type === "member" ? `⭐ ${c.memberId}` : "👤 Walk-in"}
                                  {c.checkedIn && c.checkedInAt && ` · In @ ${fmtDT(c.checkedInAt)}`}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#facc15", fontWeight: 700 }}>₹{c.price}</span>
                              <button
                                onClick={() => toggleCheckin(c.id)}
                                style={{
                                  background: c.checkedIn ? "#4ade8018" : "#00c9a7",
                                  color: c.checkedIn ? "#4ade80" : "#080c18",
                                  border: `1px solid ${c.checkedIn ? "#4ade8040" : "#00c9a7"}`,
                                  borderRadius: 7,
                                  padding: "5px 13px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {c.checkedIn ? "✓ In" : "Check In"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MEMBERS TAB */}
              {adminTab === "members" && (
                <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 13, padding: 18 }}>
                  <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
                    ALL MEMBERS{" "}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#3a5070" }}>
                      ({Object.keys(members).length})
                    </span>
                  </div>
                  {Object.keys(members).length === 0 ? (
                    <div style={{ color: "#3a5070", textAlign: "center", padding: "26px 0", fontSize: 13 }}>
                      No members yet. Add one in the next tab.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {Object.values(members)
                        .sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt))
                        .map((m, i) => {
                          const plan = PLANS[m.plan] || PLANS.basic;
                          const used = weeklyUsed(m.id, getWeekStart(todayStr()));
                          return (
                            <div
                              key={i}
                              style={{
                                background: "#080c18",
                                borderRadius: 9,
                                padding: "11px 14px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: 7,
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                                <div style={{ fontSize: 10, color: "#3a5070" }}>
                                  {m.phone} · {m.id} · Joined {fmtDate(m.joinedAt.toDate().toISOString().split("T")[0])}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontSize: 10, color: "#5a7090" }}>
                                  {used}/{plan.slotsPerWeek === 99 ? "∞" : plan.slotsPerWeek} this wk
                                </span>
                                <div
                                  style={{
                                    background: `${plan.color}20`,
                                    border: `1px solid ${plan.color}40`,
                                    borderRadius: 6,
                                    padding: "3px 9px",
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: plan.color,
                                  }}
                                >
                                  {plan.name}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* ADD MEMBER TAB */}
              {adminTab === "add-member" && (
                <div style={{ maxWidth: 420 }}>
                  <div style={{ background: "#0d1526", border: "1px solid #141e35", borderRadius: 13, padding: 22 }}>
                    <div style={{ fontFamily: "'Syne'", fontWeight: 800, fontSize: 15, marginBottom: 18 }}>
                      REGISTER NEW MEMBER
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 14 }}>
                      <input
                        placeholder="Full Name *"
                        value={addForm.name}
                        onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                        style={{
                          background: "#080c18",
                          border: "1px solid #1e2d4a",
                          borderRadius: 9,
                          padding: "12px 13px",
                          color: "#dde3f0",
                          fontSize: 14,
                        }}
                      />
                      <input
                        type="tel"
                        placeholder="Phone Number *"
                        value={addForm.phone}
                        onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                        style={{
                          background: "#080c18",
                          border: "1px solid #1e2d4a",
                          borderRadius: 9,
                          padding: "12px 13px",
                          color: "#dde3f0",
                          fontSize: 14,
                        }}
                      />
                      <select
                        value={addForm.plan}
                        onChange={e => setAddForm(p => ({ ...p, plan: e.target.value }))}
                        style={{
                          background: "#080c18",
                          border: "1px solid #1e2d4a",
                          borderRadius: 9,
                          padding: "12px 13px",
                          color: "#dde3f0",
                          fontSize: 14,
                        }}
                      >
                        {PLAN_ORDER.map(pid => (
                          <option key={pid} value={pid}>
                            {PLANS[pid].name} — ₹{PLANS[pid].price}/mo
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      disabled={!addForm.name || !addForm.phone}
                      onClick={addMember}
                      style={{
                        background: addForm.name && addForm.phone ? "#00c9a7" : "#141e35",
                        color: addForm.name && addForm.phone ? "#080c18" : "#3a5070",
                        border: "none",
                        borderRadius: 10,
                        padding: 13,
                        width: "100%",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: addForm.name && addForm.phone ? "pointer" : "not-allowed",
                      }}
                    >
                      Create Member Account
                    </button>
                    <p style={{ fontSize: 10, color: "#3a5070", marginTop: 10, textAlign: "center" }}>
                      Member ID is auto-generated. Share it with the member for self-service access.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
