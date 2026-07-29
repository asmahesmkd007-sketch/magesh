import { useEffect, useState } from "react";

import { SpectatorVisibilityControl } from "@/components/spectator/SpectatorVisibilityControl";
import { useAuth } from "@/hooks/useAuth";
import { fetchSpectatorDefault } from "@/lib/api/spectatorClient";
import type { SpectatorVisibility } from "@/lib/spectator/types";

/**
 * The account-wide spectator default, for the settings page.
 *
 * This is the only place the choice can be made *before* a match that
 * has no lobby — Quick Match pairs you into an active game immediately,
 * so "set it before you start" has to mean "set it once, for all games".
 * A per-match override is still available on the board itself.
 *
 * Stored on profiles.spectator_default rather than in the local settings
 * store: it is a privacy control, and the database has to be able to
 * enforce it without trusting a client value.
 */
export function SpectatorDefaultSetting() {
  const { user } = useAuth();
  const [value, setValue] = useState<SpectatorVisibility>("public");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void fetchSpectatorDefault(user.id)
      .then((v) => {
        if (!alive) return;
        setValue(v);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null;

  return (
    <div className={loaded ? "" : "pointer-events-none opacity-50"}>
      <div className="mb-1 text-sm font-semibold text-foreground">Spectators</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Ranked broadcasts always run 20–30 seconds behind play, so an audience can never feed your
        live position to an engine.
      </p>
      <SpectatorVisibilityControl scope="account" value={value} onChange={setValue} />
    </div>
  );
}
