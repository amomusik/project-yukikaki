/** Name and value of the required "I have read the notice" checkbox on the interview page. */
export const INTERVIEW_CONSENT_FIELD = "recording_consent";
export const INTERVIEW_CONSENT_VALUE = "yes";

/** Server-side gate: a brief is only accepted when the owner ticked the recording/processing notice. */
export function hasInterviewConsent(formData: FormData): boolean {
  return formData.get(INTERVIEW_CONSENT_FIELD) === INTERVIEW_CONSENT_VALUE;
}
