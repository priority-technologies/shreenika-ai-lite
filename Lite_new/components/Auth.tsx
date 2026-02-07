import { useState } from "react";
import { apiFetch } from "../services/api";
import Logo from "./assets/logo.svg";
import ForgotPasswordPopup from "./ForgotPasswordPopup";

type AuthProps = {
  onLogin: () => void;
};

export default function Auth({ onLogin }: AuthProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 🔹 ADDITION (Forgot Password popup state)
  const [showForgotPopup, setShowForgotPopup] = useState(false);

  const handleSubmit = async () => {
    try {
      setError("");
      setLoading(true);

      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";

      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (res.token) {
        // Both login and signup now return a token
        localStorage.setItem("token", res.token);
        localStorage.setItem("user", JSON.stringify(res.user));
        onLogin();
      } else {
        throw new Error("Authentication failed. Please try again.");
      }
    } catch (err: any) {
      // Show the actual error message from the backend
      const message = err?.message || "";
      if (message.includes("User already exists")) {
        setError("An account with this email already exists. Try signing in.");
      } else if (message.includes("Invalid credentials")) {
        setError("Invalid email or password.");
      } else if (message.includes("Email not verified")) {
        setError("Please verify your email before logging in.");
      } else {
        setError(message || (mode === "login" ? "Invalid email or password" : "Unable to create account. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     GOOGLE LOGIN (ADDED)
  ========================= */
  const handleGoogleLogin = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || "https://shreenika-ai-backend-507468019722.asia-south1.run.app";
    window.location.href = `${apiBase}/auth/google`;
  };

  return (
    <>
      {/* 🔹 ADDITION (Forgot Password Popup Mount) */}
      {showForgotPopup && (
        <ForgotPasswordPopup
          onClose={() => setShowForgotPopup(false)}
        />
      )}

      <div style={styles.page}>
        <div style={styles.card}>
          {/* Logo */}
          <div style={styles.logoWrap}>
            <img src={Logo} alt="Shreenika AI" style={styles.logo} />
          </div>

          {/* Title */}
          <h1 style={styles.title}>Shreenika AI</h1>
          <p style={styles.subtitle}>
            Enterprise Voice Automation Platform
          </p>

          <h2 style={styles.heading}>
            {mode === "login" ? "Welcome Back" : "Get Started"}
          </h2>

          {/* Email */}
          <div style={styles.field}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
          </div>

          {/* Password */}
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrap}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.passwordInput}
              />
              <span
                style={styles.eye}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "🙈" : "👁️"}
              </span>
            </div>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {/* Primary Button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={styles.primaryBtn}
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Sign In →"
              : "Create Account →"}
          </button>

          {/* Divider */}
          <div style={styles.divider}>
            <span>Or continue with</span>
          </div>

          {/* Google Button */}
          <button style={styles.googleBtn} onClick={handleGoogleLogin}>
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              style={{ width: 18, marginRight: 10 }}
            />
            Google
          </button>

          {/* Footer */}
          <div style={styles.footer}>
            {mode === "login" ? (
              <>
                <span
                  style={styles.link}
                  /* 🔹 LOGIC UPDATED (no redirect, popup instead) */
                  onClick={() => setShowForgotPopup(true)}
                >
                  Forgot password?
                </span>
                <br />
                <span style={styles.switch}>
                  Don&apos;t have an account?{" "}
                  <span
                    style={styles.link}
                    onClick={() => setMode("signup")}
                  >
                    Sign Up
                  </span>
                </span>
              </>
            ) : (
              <span style={styles.switch}>
                Already have an account?{" "}
                <span
                  style={styles.link}
                  onClick={() => setMode("login")}
                >
                  Sign In
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg,#eef2ff,#f8fafc)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: 440,
    background: "#ffffff",
    borderRadius: 18,
    padding: "36px 32px",
    boxShadow: "0 30px 60px rgba(0,0,0,0.12)",
    textAlign: "center",
  },
  logoWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 16,
  },
  logo: {
    width: 124,
    height: "auto",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 28,
  },
  heading: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 24,
  },
  field: {
    textAlign: "left",
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    marginBottom: 6,
    display: "block",
    color: "#334155",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5f5",
    fontSize: 14,
  },
  passwordWrap: {
    display: "flex",
    alignItems: "center",
    border: "1px solid #cbd5f5",
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    padding: "12px 14px",
    border: "none",
    outline: "none",
    fontSize: 14,
  },
  eye: {
    padding: "0 14px",
    cursor: "pointer",
  },
  primaryBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontSize: 16,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 6,
  },
  divider: {
    margin: "24px 0 18px",
    fontSize: 13,
    color: "#64748b",
  },
  googleBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    marginTop: 18,
    fontSize: 13,
  },
  link: {
    color: "#1d4ed8",
    cursor: "pointer",
    fontWeight: 500,
  },
  switch: {
    color: "#475569",
  },
  error: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 14,
  },
};
