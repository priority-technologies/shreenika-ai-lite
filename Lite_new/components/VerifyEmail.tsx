import { useParams } from "react-router-dom";
import { useEffect } from "react";
import { apiFetch } from "../services/api";

export default function VerifyEmail() {
  const { token } = useParams();

  useEffect(() => {
    apiFetch(`/auth/verify/${token}`).then(() => {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      user.emailVerified = true;
      localStorage.setItem("user", JSON.stringify(user));
      window.location.href = "/dashboard";
    });
  }, []);

  return <p>Verifying email...</p>;
}
