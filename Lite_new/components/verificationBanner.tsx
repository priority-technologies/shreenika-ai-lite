export default function VerificationBanner({ user }) {
  if (user?.emailVerified) return null;

  return (
    <div style={{
      background: "#fde047",
      color: "#000",
      padding: "10px",
      textAlign: "center",
      fontWeight: 500,
      position: "fixed",
      top: 0,
      width: "100%",
      zIndex: 9999
    }}>
      Your account is pending verification, please verify your account now.
    </div>
  );
}
