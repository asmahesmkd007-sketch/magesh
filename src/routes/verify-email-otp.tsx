import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MailCheck, ShieldAlert } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { OtpInput } from "@/components/auth/OtpInput";
import { GoldButton } from "@/components/site/Primitives";
import {
  requestEmailVerificationOtp,
  verifyEmailVerificationOtp,
} from "@/lib/api/registration.functions";
import { OTP_LENGTH, OTP_TTL_MS, RESEND_COOLDOWN_MS } from "@/lib/auth/otpPolicy";
import { noindexSeo } from "@/lib/seo";

export const Route = createFileRoute("/verify-email-otp")({
  head: () =>
    noindexSeo(
      "Verify Email — ChessOx",
      "Enter the 6-digit verification code sent to your email.",
      "noindex, nofollow",
    ),
  component: VerifyEmailOtpPage,
});

function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type SignupState = {
  email: string;
  username: string;
  sentAt: number;
};

const STORAGE_KEY = "chessox_signup_otp_state";

export function readSignupState(): SignupState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupState;
    if (parsed.email && parsed.username && typeof parsed.sentAt === "number") {
      return parsed;
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

export function writeSignupState(state: SignupState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors */
  }
}

export function clearSignupState() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function VerifyEmailOtpPage() {
  const navigate = useNavigate();
  const [signupState, setSignupState] = useState<SignupState | null>(null);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [dead, setDead] = useState(false);

  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const verifying = useRef(false);
  const requesting = useRef(false);

  useEffect(() => {
    const st = readSignupState();
    if (!st) {
      navigate({ to: "/auth", search: { mode: "signup" } });
      return;
    }
    setSignupState(st);
    setExpiresAt(st.sentAt + OTP_TTL_MS);
    setResendAt(st.sentAt + RESEND_COOLDOWN_MS);
  }, [navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const expiresIn = Math.max(0, expiresAt - now);
  const resendIn = Math.max(0, resendAt - now);
  const expired = expiresIn === 0;

  const handleVerify = useCallback(
    async (codeToVerify?: string) => {
      const code = codeToVerify ?? otp;
      if (verifying.current || code.length !== OTP_LENGTH || !signupState) return;
      verifying.current = true;
      setError(null);
      setNotice(null);
      setBusy(true);

      try {
        const res = await verifyEmailVerificationOtp({
          data: { email: signupState.email, otp: code },
        });

        if (res.ok) {
          clearSignupState();
          navigate({ to: "/create-password", search: { setupToken: res.setupToken } });
          return;
        }

        if (res.reason === "invalid_otp") {
          setError(
            res.attemptsLeft > 0
              ? `Incorrect code. ${res.attemptsLeft} attempt${res.attemptsLeft === 1 ? "" : "s"} remaining.`
              : "Incorrect code. Maximum attempts exceeded.",
          );
        } else if (res.reason === "otp_expired") {
          setError("This verification code has expired. Please request a new one.");
        } else if (res.reason === "too_many_attempts") {
          setDead(true);
          setError("Maximum verification attempts exceeded. Please request a new code.");
        } else if (res.reason === "already_verified") {
          clearSignupState();
          navigate({ to: "/auth" });
          return;
        }
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Verification failed. Please try again.",
        );
      } finally {
        verifying.current = false;
        setBusy(false);
      }
    },
    [otp, signupState, navigate],
  );

  async function handleResend() {
    if (requesting.current || resendIn > 0 || !signupState) return;
    requesting.current = true;
    setError(null);
    setNotice(null);
    setResending(true);

    try {
      const res = await requestEmailVerificationOtp({
        data: { email: signupState.email, username: signupState.username },
      });

      if (!res.ok) {
        if (res.reason === "cooldown") {
          const sentAt = Date.now() - (RESEND_COOLDOWN_MS - res.resendInSeconds * 1000);
          setResendAt(sentAt + RESEND_COOLDOWN_MS);
          setError(`Please wait ${res.resendInSeconds} seconds before resending.`);
        } else {
          setError("We couldn't send the verification email right now. Please try again.");
        }
        return;
      }

      const nowMs = Date.now();
      const newState: SignupState = {
        email: signupState.email,
        username: signupState.username,
        sentAt: nowMs,
      };
      writeSignupState(newState);
      setSignupState(newState);
      setExpiresAt(nowMs + OTP_TTL_MS);
      setResendAt(nowMs + RESEND_COOLDOWN_MS);
      setOtp("");
      setDead(false);
      setNotice("A fresh 6-digit verification code has been sent to your email.");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't send the verification email right now. Please try again.",
      );
    } finally {
      requesting.current = false;
      setResending(false);
    }
  }

  if (!signupState) {
    return (
      <div className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-[#0f0505]">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <AuthShell
      title="Verify your email"
      subtitle={`We sent a 6-digit verification code to ${signupState.email}`}
      icon={<MailCheck className="h-7 w-7 text-gold" />}
      step={[1, 3]}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Verification code</span>
            <span className={expired ? "font-semibold text-red-400" : "tabular-nums"}>
              {expired ? "Code expired" : `Expires in ${mmss(expiresIn)}`}
            </span>
          </div>

          <OtpInput
            value={otp}
            onChange={(val) => {
              setOtp(val);
              if (error) setError(null);
            }}
            onComplete={(val) => handleVerify(val)}
            disabled={busy || expired || dead}
            autoFocus
            invalid={Boolean(error)}
            ariaLabel="6-digit email verification code"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-lg border border-gold/30 bg-gold/10 p-3 text-xs leading-relaxed text-gold"
          >
            {notice}
          </div>
        )}

        <GoldButton
          type="button"
          onClick={() => handleVerify()}
          disabled={busy || otp.length !== OTP_LENGTH || expired || dead}
          className="w-full"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying Code...
            </span>
          ) : (
            "Verify Code"
          )}
        </GoldButton>

        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendIn > 0}
            className="text-gold hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            {resending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Resending...
              </span>
            ) : resendIn > 0 ? (
              `Resend code in ${Math.ceil(resendIn / 1000)}s`
            ) : (
              "Resend verification code"
            )}
          </button>

          <Link to="/auth" search={{ mode: "signup" }} className="hover:text-ivory hover:underline">
            Use different email
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
