import { useState } from "react";
import { apiFetch } from "../services/api";

export default function ResetPassword() {
  const token = window.location.pathname.split("/").pop();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    if (!password || !confirmPassword) {
      setError("Both fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          password,
        }),
      });

      setSuccess(true);
    } catch {
      setError("Invalid or expired reset link");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h2>Password Updated</h2>
          <p>Your password has been reset successfully.</p>
          <button
            style={styles.primaryBtn}
            onClick={() => (window.location.href = "/login")}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.heading}>Reset Password</h2>

        <div style={styles.field}>
          <label style={styles.label}>New Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={styles.input}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          style={styles.primaryBtn}
          onClick={handleReset}
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
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
    width: 420,
    background: "#ffffff",
    borderRadius: 18,
    padding: "36px 32px",
    boxShadow: "0 30px 60px rgba(0,0,0,0.12)",
    textAlign: "center",
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
  error: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 14,
  },
};
