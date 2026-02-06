import twilio from "twilio";

export const getTwilioClient = () => {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN
  } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials missing");
  }

  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
};
