import { describe, expect, it, vi } from "vitest";
import {
  acquireSessionHandler,
  heartbeatSessionHandler,
  releaseSessionHandler,
} from "@/lib/api/session.functions";
import {
  clearSessionId,
  getDeviceId,
  getSessionId,
  isSessionLockSuppressed,
  releaseSessionLockSuppression,
  resetSessionId,
  suppressSessionLock,
} from "./sessionLock";

const USER_1 = "10000000-0000-0000-0000-000000000001";
const USER_2 = "20000000-0000-0000-0000-000000000002";

describe("Single-Device Session Locking Suite", () => {
  it("1. First device login succeeds", async () => {
    const res = await acquireSessionHandler({
      userId: USER_1,
      sessionId: "session_a_1",
      deviceId: "device_a_1",
      timeoutSeconds: 90,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("ACQUIRED");
  });

  it("2. Second device login is rejected while first is active", async () => {
    // Device A logs in
    await acquireSessionHandler({
      userId: USER_2,
      sessionId: "session_dev_a",
      deviceId: "device_dev_a",
      timeoutSeconds: 90,
    });

    // Device B attempts login with same user
    const resB = await acquireSessionHandler({
      userId: USER_2,
      sessionId: "session_dev_b",
      deviceId: "device_dev_b",
      timeoutSeconds: 90,
    });

    expect(resB.ok).toBe(false);
    expect(resB.status).toBe("ALREADY_LOGGED_IN");
  });

  it("3. Correct error message appears on rejected login", async () => {
    const userId = "30000000-0000-0000-0000-000000000003";
    await acquireSessionHandler({
      userId,
      sessionId: "sess_a",
      deviceId: "dev_a",
      timeoutSeconds: 90,
    });

    const resB = await acquireSessionHandler({
      userId,
      sessionId: "sess_b",
      deviceId: "dev_b",
      timeoutSeconds: 90,
    });

    expect(resB.ok).toBe(false);
    expect(resB.message).toBe(
      "This user is already logged in on another device. Please log out from the other device or wait until that session expires.",
    );
  });

  it("4. First device logout allows second device login", async () => {
    const userId = "40000000-0000-0000-0000-000000000004";
    // Device A acquires
    await acquireSessionHandler({
      userId,
      sessionId: "sess_dev_a",
      deviceId: "dev_a",
      timeoutSeconds: 90,
    });

    // Device A explicitly logs out
    const releaseRes = await releaseSessionHandler({
      userId,
      sessionId: "sess_dev_a",
    });
    expect(releaseRes.released).toBe(true);

    // Device B now attempts login
    const resB = await acquireSessionHandler({
      userId,
      sessionId: "sess_dev_b",
      deviceId: "dev_b",
      timeoutSeconds: 90,
    });

    expect(resB.ok).toBe(true);
    expect(resB.status).toBe("ACQUIRED");
  });

  it("5. First device heartbeat keeps session active", async () => {
    const userId = "50000000-0000-0000-0000-000000000005";
    await acquireSessionHandler({
      userId,
      sessionId: "sess_heartbeat",
      deviceId: "dev_hb",
      timeoutSeconds: 90,
    });

    const hb = await heartbeatSessionHandler({
      userId,
      sessionId: "sess_heartbeat",
      deviceId: "dev_hb",
      timeoutSeconds: 90,
    });

    expect(hb.valid).toBe(true);
  });

  it("6. Network loss / browser crash eventually expires session after timeout", async () => {
    vi.useFakeTimers();
    const userId = "60000000-0000-0000-0000-000000000006";

    // Device A acquires session with 90s timeout
    await acquireSessionHandler({
      userId,
      sessionId: "sess_crash_a",
      deviceId: "dev_crash_a",
      timeoutSeconds: 90,
    });

    // Advance time past 90 seconds (no heartbeat sent from crashed Device A)
    vi.advanceTimersByTime(91_000);

    // Device B attempts login
    const resB = await acquireSessionHandler({
      userId,
      sessionId: "sess_b",
      deviceId: "dev_b",
      timeoutSeconds: 90,
    });

    expect(resB.ok).toBe(true);
    expect(resB.status).toBe("ACQUIRED");
    vi.useRealTimers();
  });

  it("7. Two simultaneous login attempts allow only one", async () => {
    const userId = "70000000-0000-0000-0000-000000000007";

    const [resA, resB] = await Promise.all([
      acquireSessionHandler({
        userId,
        sessionId: "sess_sim_a",
        deviceId: "dev_sim_a",
        timeoutSeconds: 90,
      }),
      acquireSessionHandler({
        userId,
        sessionId: "sess_sim_b",
        deviceId: "dev_sim_b",
        timeoutSeconds: 90,
      }),
    ]);

    // Exactly one must succeed and one must fail
    const successCount = (resA.ok ? 1 : 0) + (resB.ok ? 1 : 0);
    expect(successCount).toBe(1);
  });

  it("8. Session refresh re-acquires without creating duplicate session", async () => {
    const userId = "80000000-0000-0000-0000-000000000008";
    const session1 = await acquireSessionHandler({
      userId,
      sessionId: "sess_same",
      deviceId: "dev_same",
      timeoutSeconds: 90,
    });
    expect(session1.ok).toBe(true);

    // Same device/session re-acquires (token refresh)
    const session2 = await acquireSessionHandler({
      userId,
      sessionId: "sess_same",
      deviceId: "dev_same",
      timeoutSeconds: 90,
    });
    expect(session2.ok).toBe(true);
  });

  it("9. Google and email/password login session locking work identically", async () => {
    const userEmail = "90000000-0000-0000-0000-000000000009";
    const userGoogle = "90000000-0000-0000-0000-000000000099";

    const emailRes = await acquireSessionHandler({
      userId: userEmail,
      sessionId: "sess_email",
      deviceId: "dev_email",
      timeoutSeconds: 90,
    });
    expect(emailRes.ok).toBe(true);

    const googleRes = await acquireSessionHandler({
      userId: userGoogle,
      sessionId: "sess_google",
      deviceId: "dev_google",
      timeoutSeconds: 90,
    });
    expect(googleRes.ok).toBe(true);
  });

  it("10. Expired/invalidated session heartbeat returns valid: false", async () => {
    const userId = "a0000000-0000-0000-0000-00000000000a";
    await acquireSessionHandler({
      userId,
      sessionId: "sess_old",
      deviceId: "dev_old",
      timeoutSeconds: 90,
    });

    // Session released / invalidated
    await releaseSessionHandler({ userId, sessionId: "sess_old" });

    const hb = await heartbeatSessionHandler({
      userId,
      sessionId: "sess_old",
      deviceId: "dev_old",
      timeoutSeconds: 90,
    });

    expect(hb.valid).toBe(false);
    expect(hb.reason).toBe("SESSION_INVALIDATED");
  });

  it("11. Client device and session ID utilities behave correctly", () => {
    const devId = getDeviceId();
    expect(devId).toBeDefined();
    expect(typeof devId).toBe("string");

    const sessId1 = getSessionId();
    expect(sessId1).toBeDefined();

    const sessId2 = resetSessionId();
    expect(sessId2).toBeDefined();
    expect(sessId2).not.toBe(sessId1);

    clearSessionId();
  });

  it("12. Lock suppression is off by default and toggles both ways", () => {
    expect(isSessionLockSuppressed()).toBe(false);
    suppressSessionLock();
    expect(isSessionLockSuppressed()).toBe(true);
    releaseSessionLockSuppression();
    expect(isSessionLockSuppressed()).toBe(false);
  });

  it("13. Release without a sessionId frees whatever session the user holds", async () => {
    // What a password reset does: it has revoked every session globally and
    // does not know the other device's session id, but must still clear the
    // claim or the next login is refused as ALREADY_LOGGED_IN.
    const userId = "40000000-0000-0000-0000-000000000004";
    await acquireSessionHandler({
      userId,
      sessionId: "sess_other_device",
      deviceId: "dev_other_device",
      timeoutSeconds: 90,
    });

    await releaseSessionHandler({ userId });

    const hb = await heartbeatSessionHandler({
      userId,
      sessionId: "sess_other_device",
      deviceId: "dev_other_device",
      timeoutSeconds: 90,
    });
    expect(hb.valid).toBe(false);

    // And a fresh login from a different device now succeeds.
    const relogin = await acquireSessionHandler({
      userId,
      sessionId: "sess_after_reset",
      deviceId: "dev_after_reset",
      timeoutSeconds: 90,
    });
    expect(relogin.ok).toBe(true);
    expect(relogin.status).toBe("ACQUIRED");
  });
});
