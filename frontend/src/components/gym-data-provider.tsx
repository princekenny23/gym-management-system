"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  AuthUser,
  AttendanceRecord,
  GymSettings,
  Member,
  Membership,
  MembershipPlan,
  Payment,
} from "@/types/gym";
import { apiFetch, getApiUrl, responseError } from "@/lib/api-client";

interface GymData {
  members: Member[];
  plans: MembershipPlan[];
  memberships: Membership[];
  payments: Payment[];
  attendance: AttendanceRecord[];
  settings: GymSettings;
}

interface GymDataContextValue extends GymData {
  currentUser: AuthUser | null;
  authReady: boolean;
  authError: string;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setMembers: Dispatch<SetStateAction<Member[]>>;
  setPlans: Dispatch<SetStateAction<MembershipPlan[]>>;
  setMemberships: Dispatch<SetStateAction<Membership[]>>;
  setPayments: Dispatch<SetStateAction<Payment[]>>;
  setAttendance: Dispatch<SetStateAction<AttendanceRecord[]>>;
  setSettings: Dispatch<SetStateAction<GymSettings>>;
  saving: boolean;
  retrySave: () => void;
}

const emptySettings: GymSettings = {
  gymName: "",
  logoText: "",
  address: "",
  phone: "",
  email: "",
  currency: "MWK",
  primaryColor: "#111827",
  receiptFooter: "",
  expiryWarningDays: 7,
  duplicateCheckInMinutes: 30,
};

const emptyData: GymData = {
  members: [],
  plans: [],
  memberships: [],
  payments: [],
  attendance: [],
  settings: emptySettings,
};

const GymDataContext = createContext<GymDataContextValue | null>(null);

export function GymDataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<GymSettings>(emptySettings);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const [saveRevision, setSaveRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const load = async () => {
      let authenticated = false;
      try {
        const sessionResponse = await apiFetch("/auth/me/");
        if (sessionResponse.status === 403 || sessionResponse.status === 401) {
          if (!active) return;
          setCurrentUser(null);
          setAuthReady(true);
          setReady(false);
          return;
        }
        if (!sessionResponse.ok) throw new Error(await responseError(sessionResponse));
        const session = (await sessionResponse.json()) as AuthUser | { authenticated: false };
        if (!("id" in session)) {
          if (!active) return;
          setCurrentUser(null);
          setAuthReady(true);
          setReady(false);
          return;
        }
        const user = session;
        authenticated = true;
        if (!active) return;
        setCurrentUser(user);
        if (user.role === "member") {
          setMembers([]);
          setPlans([]);
          setMemberships([]);
          setPayments([]);
          setAttendance([]);
          setSettings(emptySettings);
          setLoadError("");
          setAuthError("");
          setReady(true);
          setAuthReady(true);
          return;
        }
        const response = await apiFetch("/snapshot/", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseError(response));
        const data = (await response.json()) as Partial<GymData>;
        if (
          !Array.isArray(data.members) ||
          !Array.isArray(data.plans) ||
          !Array.isArray(data.memberships) ||
          !Array.isArray(data.payments) ||
          !Array.isArray(data.attendance) ||
          !data.settings
        ) {
          throw new Error("The backend returned an invalid data snapshot.");
        }
        if (!active) return;
        // The API is the source of truth; initialize client state only after its response.
        setMembers(data.members);
        setPlans(data.plans);
        setMemberships(data.memberships);
        setPayments(data.payments);
        setAttendance(data.attendance);
        setSettings(data.settings);
        setLoadError("");
        setAuthError("");
        setReady(true);
        setAuthReady(true);
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        console.error("Could not load gym records from the Django API.", error);
        const message = error instanceof Error ? error.message : "The Django API could not be reached.";
        if (!authenticated) setAuthError(message);
        else setLoadError(message);
        setAuthReady(true);
      }
    };

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadId]);

  useEffect(() => {
    if (!ready || !currentUser || currentUser.role === "member") return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSaving(true);
      try {
        const response = await apiFetch("/snapshot/", {
          method: "PUT",
          body: JSON.stringify({ members, plans, memberships, payments, attendance, settings }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await responseError(response));
        setSaveError("");
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Could not save gym records to the Django API.", error);
        setSaveError(error instanceof Error ? error.message : "Changes could not be saved.");
      } finally {
        if (!controller.signal.aborted) setSaving(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attendance, currentUser, memberships, payments, plans, ready, saveRevision, settings, members]);

  const signIn = useCallback(async (username: string, password: string) => {
    setAuthError("");
    const response = await apiFetch("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) throw new Error(await responseError(response));
    setCurrentUser((await response.json()) as AuthUser);
    setReady(false);
    setReloadId((id) => id + 1);
  }, []);

  const signOut = useCallback(async () => {
    const response = await apiFetch("/auth/logout/", { method: "POST" });
    if (!response.ok) throw new Error(await responseError(response));
    setCurrentUser(null);
    setReady(false);
    setLoadError("");
    setSaveError("");
  }, []);

  const value = useMemo(
    () => ({
      ...emptyData,
      currentUser,
      authReady,
      authError,
      signIn,
      signOut,
      members,
      plans,
      memberships,
      payments,
      attendance,
      settings,
      setMembers,
      setPlans,
      setMemberships,
      setPayments,
      setAttendance,
      setSettings,
      saving,
      retrySave: () => setSaveRevision((revision) => revision + 1),
    }),
    [attendance, authError, authReady, currentUser, members, memberships, payments, plans, saving, settings, signIn, signOut],
  );

  return (
    <GymDataContext.Provider value={value}>
      {children}
      {!authReady || (currentUser && !ready) ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-100 p-6">
          <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">
              {loadError ? "Backend connection required" : "Connecting to gym database"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {loadError
                ? `Could not load records from ${getApiUrl()}. ${loadError}`
                : "Loading saved gym records from Django and PostgreSQL…"}
            </p>
            {loadError ? (
              <button
                type="button"
                onClick={() => {
                  setLoadError("");
                  setReloadId((id) => id + 1);
                }}
                className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Retry connection
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
      {currentUser && ready && saveError ? (
        <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-lg rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-800 shadow-lg">
          <p>Save failed: {saveError}</p>
          <button type="button" onClick={value.retrySave} className="mt-2 rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium">
            Retry save
          </button>
        </div>
      ) : currentUser && saving ? (
        <div aria-live="polite" className="fixed bottom-4 right-4 z-50 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-lg">
          Saving to database…
        </div>
      ) : null}
    </GymDataContext.Provider>
  );
}

export function useGymData() {
  const context = useContext(GymDataContext);
  if (!context) {
    throw new Error("useGymData must be used within a GymDataProvider.");
  }
  return context;
}
