import { useState } from "react";
import { apiFetch } from "../services/api";

type Props = {
  onClose: () => void;
};

export default function ForgotPasswordPopup({ onClose }: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!email) {
      setError("Email is required");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      setSent(true);
    } catch {
      setError("Unable to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {!sent ? (
          <>
            <h3 style={styles.heading}>Forgot Password</h3>
            <p style={styles.text}>
              Enter your email to receive a reset link.
            </p>

            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />

            {error && <div style={styles.error}>{error}</div>}

            <button
              onClick={handleSend}
              disabled={loading}
              style={styles.primaryBtn}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <button onClick={onClose} style={styles.linkBtn}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <h3 style={styles.heading}>Check Your Email</h3>
            <p style={styles.text}>
              A password reset link has been sent to your email.
            </p>
            <button onClick={onClose} style={styles.primaryBtn}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, any> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  card: {
    width: 420,
    background: "#ffffff",
    borderRadius: 18,
    padding: "32px 28px",
    boxShadow: "0 30px 60px rgba(0,0,0,0.2)",
    textAlign: "center",
  },
  heading: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 12,
  },
  text: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 18,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #cbd5f5",
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 12,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 6,
  },
  linkBtn: {
    marginTop: 14,
    background: "transparent",
    border: "none",
    color: "#1d4ed8",
    cursor: "pointer",
    fontSize: 14,
  },
  error: {
    background: "#fee2e2",
    color: "#b91c1c",
    padding: 10,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 12,
  },
};
