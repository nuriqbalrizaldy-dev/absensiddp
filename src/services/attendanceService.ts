import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  getConfiguredAdminEmail,
  getSupabaseClient,
  isSupabaseConfigured,
} from '../lib/supabase';
import {
  DEFAULT_TRAINING_CONFIG,
  formatScheduleSummary,
  sortTrainingDates,
  validateAttendanceInput,
  validateTrainingConfigInput,
  type AttendanceInput,
  type AttendanceRecord,
  type TrainingConfig,
} from '../utils/attendanceLogic';

export const BOOTSTRAPPED_ADMIN_EMAIL = getConfiguredAdminEmail();

export interface AppAuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

const TRAINING_CONFIG_COLLECTION = 'training_config';
const TRAINING_CONFIG_DOC_ID = 'current';
const ATTENDANCES_COLLECTION = 'attendances';

function generateSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now()}_${randomPart}`;
}

function mapFirebaseUser(user: User | null): AppAuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}

function mapSupabaseConfigRow(row: Record<string, unknown> | null): TrainingConfig {
  if (!row) return DEFAULT_TRAINING_CONFIG;
  const rawDates = Array.isArray(row.dates)
    ? sortTrainingDates(row.dates.filter((d): d is string => typeof d === 'string'))
    : DEFAULT_TRAINING_CONFIG.dates;
  const dates = rawDates.length > 0 ? rawDates : DEFAULT_TRAINING_CONFIG.dates;

  return {
    title:
      typeof row.title === 'string' && row.title.trim().length >= 3
        ? row.title
        : DEFAULT_TRAINING_CONFIG.title,
    scheduleSummary:
      typeof row.schedule_summary === 'string' && row.schedule_summary.trim().length >= 3
        ? row.schedule_summary
        : formatScheduleSummary(dates),
    dates,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : undefined,
  };
}

function mapSupabaseAttendanceRow(row: Record<string, unknown>): AttendanceRecord {
  const submittedIso = typeof row.submitted_at === 'string' ? row.submitted_at : '';
  const parsedMs = submittedIso ? Date.parse(submittedIso) : NaN;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    fullName: typeof row.full_name === 'string' ? row.full_name : '-',
    position: typeof row.position === 'string' ? row.position : '-',
    sessionDate: typeof row.session_date === 'string' ? row.session_date : '-',
    signatureDataUrl: typeof row.signature_data_url === 'string' ? row.signature_data_url : '',
    trainingTitle: typeof row.training_title === 'string' ? row.training_title : '',
    submittedAtMs: Number.isFinite(parsedMs) ? parsedMs : Date.now(),
  };
}

export function subscribeAuthState(callback: (user: AppAuthUser | null) => void): () => void {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const u = data.session?.user ?? null;
      callback(
        u
          ? {
              uid: u.id,
              email: u.email ?? null,
              emailVerified: Boolean(u.email_confirmed_at || u.confirmed_at || u.email),
            }
          : null,
      );
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      callback(
        u
          ? {
              uid: u.id,
              email: u.email ?? null,
              emailVerified: Boolean(u.email_confirmed_at || u.confirmed_at || u.email),
            }
          : null,
      );
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }

  return onAuthStateChanged(auth, (currentUser) => {
    callback(mapFirebaseUser(currentUser));
  });
}

export async function signInAdminWithGoogle(): Promise<void> {
  if (isSupabaseConfigured()) {
    if (typeof window !== 'undefined' && window.self !== window.top) {
      throw new Error(
        'Login Google Supabase tidak dapat dijalankan di dalam frame preview. Silakan buka URL aplikasi di tab browser baru (atau di Vercel setelah deploy) untuk masuk sebagai Admin PIC.',
      );
    }
    const supabase = getSupabaseClient();
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  await signInWithPopup(auth, googleProvider);
}

export async function signOutAdmin(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  await signOut(auth);
}

export async function checkIsAdminUser(user: AppAuthUser | null): Promise<boolean> {
  if (!user || !user.emailVerified) {
    return false;
  }
  const allowedEmail = getConfiguredAdminEmail().toLowerCase();
  if (user.email?.toLowerCase() === allowedEmail) {
    return true;
  }

  if (isSupabaseConfigured()) {
    if (!user.email) return false;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('admins')
      .select('email')
      .ilike('email', user.email)
      .maybeSingle();
    return !error && Boolean(data);
  }

  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export function subscribeTrainingConfig(
  onData: (config: TrainingConfig) => void,
  onError?: (err: Error) => void,
): () => void {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    let cancelled = false;

    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from('training_config')
        .select('*')
        .eq('id', TRAINING_CONFIG_DOC_ID)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        onError?.(new Error(error.message));
        onData(DEFAULT_TRAINING_CONFIG);
        return;
      }
      onData(mapSupabaseConfigRow(data as Record<string, unknown> | null));
    };

    void fetchConfig();

    const channel = supabase
      .channel('realtime_training_config')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'training_config',
          filter: `id=eq.${TRAINING_CONFIG_DOC_ID}`,
        },
        (payload) => {
          if (cancelled) return;
          if (payload.new && typeof payload.new === 'object') {
            onData(mapSupabaseConfigRow(payload.new as Record<string, unknown>));
          } else {
            void fetchConfig();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }

  const path = `${TRAINING_CONFIG_COLLECTION}/${TRAINING_CONFIG_DOC_ID}`;
  const docRef = doc(db, TRAINING_CONFIG_COLLECTION, TRAINING_CONFIG_DOC_ID);

  return onSnapshot(
    docRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(DEFAULT_TRAINING_CONFIG);
        return;
      }
      const data = snapshot.data();
      const dates = Array.isArray(data.dates)
        ? sortTrainingDates(data.dates.filter((d): d is string => typeof d === 'string'))
        : DEFAULT_TRAINING_CONFIG.dates;

      const updatedAt =
        data.updatedAt instanceof Timestamp
          ? data.updatedAt.toDate().toISOString()
          : undefined;

      onData({
        title:
          typeof data.title === 'string' && data.title.trim().length >= 3
            ? data.title
            : DEFAULT_TRAINING_CONFIG.title,
        scheduleSummary:
          typeof data.scheduleSummary === 'string' && data.scheduleSummary.trim().length >= 3
            ? data.scheduleSummary
            : formatScheduleSummary(dates),
        dates: dates.length > 0 ? dates : DEFAULT_TRAINING_CONFIG.dates,
        updatedAt,
        updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function saveTrainingConfig(
  input: { title: string; dates: string[]; scheduleSummary?: string },
  updatedBy: string,
): Promise<TrainingConfig> {
  const sortedDates = sortTrainingDates(input.dates);
  const title = input.title.trim();
  const scheduleSummary = (input.scheduleSummary?.trim() || formatScheduleSummary(sortedDates)).trim();

  const validation = validateTrainingConfigInput({
    title,
    dates: sortedDates,
    scheduleSummary,
  });
  if (!validation.valid) {
    const firstMsg =
      validation.errors.title ||
      validation.errors.dates ||
      validation.errors.scheduleSummary ||
      'Konfigurasi pelatihan tidak valid.';
    throw new Error(firstMsg);
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('training_config').upsert({
      id: TRAINING_CONFIG_DOC_ID,
      title,
      schedule_summary: scheduleSummary,
      dates: sortedDates,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy.slice(0, 128),
    });
    if (error) {
      throw new Error(error.message);
    }
    return {
      title,
      scheduleSummary,
      dates: sortedDates,
      updatedBy,
    };
  }

  const path = `${TRAINING_CONFIG_COLLECTION}/${TRAINING_CONFIG_DOC_ID}`;
  try {
    await setDoc(doc(db, TRAINING_CONFIG_COLLECTION, TRAINING_CONFIG_DOC_ID), {
      title,
      scheduleSummary,
      dates: sortedDates,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy.slice(0, 128),
    });

    return {
      title,
      scheduleSummary,
      dates: sortedDates,
      updatedBy,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function submitAttendance(input: AttendanceInput): Promise<{
  id: string;
  record: AttendanceInput;
  submittedAtMs: number;
}> {
  const sanitized: AttendanceInput = {
    fullName: input.fullName.trim(),
    position: input.position.trim(),
    sessionDate: input.sessionDate.trim(),
    signatureDataUrl: input.signatureDataUrl.trim(),
    trainingTitle: input.trainingTitle.trim(),
  };

  const validation = validateAttendanceInput(sanitized);
  if (!validation.valid) {
    const firstMsg =
      validation.errors.fullName ||
      validation.errors.position ||
      validation.errors.sessionDate ||
      validation.errors.signatureDataUrl ||
      validation.errors.trainingTitle ||
      'Data absensi belum lengkap.';
    throw new Error(firstMsg);
  }

  const id = generateSafeId('att');

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('attendances').insert({
      id,
      full_name: sanitized.fullName,
      position: sanitized.position,
      session_date: sanitized.sessionDate,
      signature_data_url: sanitized.signatureDataUrl,
      training_title: sanitized.trainingTitle,
      submitted_at: nowIso,
    });
    if (error) {
      throw new Error(error.message);
    }
    return {
      id,
      record: sanitized,
      submittedAtMs: Date.now(),
    };
  }

  const path = `${ATTENDANCES_COLLECTION}/${id}`;

  try {
    await setDoc(doc(db, ATTENDANCES_COLLECTION, id), {
      fullName: sanitized.fullName,
      position: sanitized.position,
      sessionDate: sanitized.sessionDate,
      signatureDataUrl: sanitized.signatureDataUrl,
      trainingTitle: sanitized.trainingTitle,
      submittedAt: serverTimestamp(),
    });

    return {
      id,
      record: sanitized,
      submittedAtMs: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeAttendances(
  onData: (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void,
): () => void {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    let cancelled = false;

    const fetchAttendances = async () => {
      const { data, error } = await supabase
        .from('attendances')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (cancelled) return;
      if (error) {
        onError?.(new Error(error.message));
        return;
      }
      const rows = (data ?? []).map((row) =>
        mapSupabaseAttendanceRow(row as Record<string, unknown>),
      );
      onData(rows);
    };

    void fetchAttendances();

    const channel = supabase
      .channel('realtime_attendances')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendances',
        },
        () => {
          if (!cancelled) {
            void fetchAttendances();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }

  const q = query(collection(db, ATTENDANCES_COLLECTION), orderBy('submittedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: AttendanceRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const submittedAtMs =
          data.submittedAt instanceof Timestamp ? data.submittedAt.toMillis() : Date.now();
        return {
          id: docSnap.id,
          fullName: typeof data.fullName === 'string' ? data.fullName : '-',
          position: typeof data.position === 'string' ? data.position : '-',
          sessionDate: typeof data.sessionDate === 'string' ? data.sessionDate : '-',
          signatureDataUrl: typeof data.signatureDataUrl === 'string' ? data.signatureDataUrl : '',
          trainingTitle: typeof data.trainingTitle === 'string' ? data.trainingTitle : '',
          submittedAtMs,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, ATTENDANCES_COLLECTION);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) {
          onError(wrapped);
        }
      }
    },
  );
}

export async function deleteAttendanceRecord(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('attendances').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const path = `${ATTENDANCES_COLLECTION}/${id}`;
  try {
    await deleteDoc(doc(db, ATTENDANCES_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
