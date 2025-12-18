import React, { useEffect, useMemo, useState } from "react";
import { STR } from "./i18n";
import { api, API_BASE } from "./api";

const BRAND = {
  phone: "873 682 2117",
  email: "info.lavepropre@gmail.com",
  tagline: "Ma maison, ma planète, j’en prends soin",
};

const days = [
  { k: 1, fr: "Lun", en: "Mon" },
  { k: 2, fr: "Mar", en: "Tue" },
  { k: 3, fr: "Mer", en: "Wed" },
  { k: 4, fr: "Jeu", en: "Thu" },
  { k: 5, fr: "Ven", en: "Fri" },
  { k: 6, fr: "Sam", en: "Sat" },
  { k: 7, fr: "Dim", en: "Sun" },
];

function hm(min) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const mm = String(min % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
function parseHm(v) {
  const [h, m] = String(v || "").split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function money(cents) {
  const v = (cents || 0) / 100;
  return v.toLocaleString(undefined, { style: "currency", currency: "CAD" });
}

function Card({ title, children, right }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
          <button style={styles.btnOutline} onClick={onClose}>✕</button>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState("fr");
  const t = STR[lang];

  const [tab, setTab] = useState("calendar");
  const [token, setToken] = useState(localStorage.getItem("lps_token") || "");
  const [me, setMe] = useState(token ? JSON.parse(localStorage.getItem("lps_me") || "null") : null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [sites, setSites] = useState([]);
  const [users, setUsers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [access, setAccess] = useState([]);

  const isAdmin = me?.role === "ADMIN";
  const isSupervisor = me?.role === "SUPERVISOR";
  const canManage = isAdmin || isSupervisor;

  const a = useMemo(() => api(token), [token]);

  const refresh = async () => {
    if (!token) return;
    try {
      const [s, sh] = await Promise.all([a.get("/sites"), a.get("/shifts")]);
      setSites(s.data);
      setShifts(sh.data);

      if (canManage) {
        const [u, p] = await Promise.all([a.get("/users"), a.get("/payroll/summary")]);
        setUsers(u.data);
        setPayroll(p.data);
      } else {
        setUsers([]);
        setPayroll([]);
      }

      if (isAdmin) {
        const acc = await a.get("/access");
        setAccess(acc.data);
      } else {
        setAccess([]);
      }
    } catch {
      doLogout();
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [token, me?.role]);

  const doLogin = async () => {
    try {
      const res = await api().post("/auth/login", { email, password });
      setToken(res.data.token);
      setMe(res.data.user);
      localStorage.setItem("lps_token", res.data.token);
      localStorage.setItem("lps_me", JSON.stringify(res.data.user));
      setTab("calendar");
    } catch {
      alert("Connexion refusée. Vérifie tes identifiants.");
    }
  };

  const doLogout = () => {
    setToken(""); setMe(null);
    localStorage.removeItem("lps_token"); localStorage.removeItem("lps_me");
    setSites([]); setUsers([]); setShifts([]); setPayroll([]); setAccess([]);
  };

  const grouped = useMemo(() => {
    const g = new Map();
    for (const d of days) g.set(d.k, []);
    for (const s of shifts) g.get(s.dayOfWeek)?.push(s);
    for (const d of days) g.get(d.k).sort((x, y) => x.startMin - y.startMin);
    return g;
  }, [shifts]);

  // ---- Shift editor modal ----
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // shift or null
  const [form, setForm] = useState({ dayOfWeek: 1, userId: "", siteId: "", start: "08:00", end: "11:00", status: "PLANNED", checklist: "" });
  const [formErr, setFormErr] = useState("");

  const openNew = () => {
    setEditing(null);
    setForm({
      dayOfWeek: 1,
      userId: users[0]?.id || (me?.id || ""),
      siteId: sites[0]?.id || "",
      start: "08:00",
      end: "11:00",
      status: "PLANNED",
      checklist: "Contrat"
    });
    setFormErr("");
    setModalOpen(true);
  };

  const openEdit = (shift) => {
    setEditing(shift);
    setForm({
      dayOfWeek: shift.dayOfWeek,
      userId: shift.userId,
      siteId: shift.siteId,
      start: hm(shift.startMin),
      end: hm(shift.endMin),
      status: shift.status,
      checklist: shift.checklist || ""
    });
    setFormErr("");
    setModalOpen(true);
  };

  const validateLocalOverlap = (cand) => {
    const sMin = parseHm(cand.start);
    const eMin = parseHm(cand.end);
    if (sMin == null || eMin == null || eMin <= sMin) return "Heures invalides";
    const sameDaySameEmp = shifts.filter((x) => x.userId === cand.userId && x.dayOfWeek === cand.dayOfWeek && x.id !== editing?.id);
    if (sameDaySameEmp.some((x) => overlaps(sMin, eMin, x.startMin, x.endMin))) return t.overlap;
    return "";
  };

  const saveShift = async () => {
    const err = validateLocalOverlap(form);
    if (err) { setFormErr(err); return; }
    const payload = {
      userId: form.userId,
      siteId: form.siteId,
      dayOfWeek: Number(form.dayOfWeek),
      startMin: parseHm(form.start),
      endMin: parseHm(form.end),
      status: form.status,
      checklist: form.checklist
    };
    try {
      if (editing) await a.patch(`/shifts/${editing.id}`, payload);
      else await a.post(`/shifts`, payload);
      setModalOpen(false);
      await refresh();
    } catch (e) {
      alert("Erreur sauvegarde (chevauchement ou droits).");
    }
  };

  const deleteShift = async () => {
    if (!editing) return;
    if (!confirm("Supprimer ce quart ?")) return;
    try {
      await a.delete(`/shifts/${editing.id}`);
      setModalOpen(false);
      await refresh();
    } catch {
      alert("Suppression refusée.");
    }
  };

  // ---- Drag & drop day ----
  const onDragStart = (shiftId) => (e) => {
    e.dataTransfer.setData("text/plain", shiftId);
  };
  const onDropDay = (dayOfWeek) => async (e) => {
    e.preventDefault();
    const shiftId = e.dataTransfer.getData("text/plain");
    const shift = shifts.find((x) => x.id === shiftId);
    if (!shift) return;
    if (!canManage) return;
    try {
      await a.patch(`/shifts/${shiftId}`, { dayOfWeek });
      await refresh();
    } catch {
      alert("Déplacement refusé (droits ou conflit).");
    }
  };
  const onDragOver = (e) => e.preventDefault();

  const confirmMine = async (shiftId) => {
    try {
      await a.patch(`/shifts/${shiftId}/confirm`);
      await refresh();
    } catch {
      alert("Impossible de confirmer.");
    }
  };

  // ---- Access management ----
  const [accUserId, setAccUserId] = useState("");
  const [accSiteId, setAccSiteId] = useState("");

  const addAccess = async () => {
    if (!accUserId || !accSiteId) return;
    try { await a.post("/access", { userId: accUserId, siteId: accSiteId }); await refresh(); }
    catch { alert("Erreur accès"); }
  };

  const removeAccess = async (userId, siteId) => {
    try { await a.delete("/access", { data: { userId, siteId } }); await refresh(); }
    catch { alert("Erreur suppression accès"); }
  };

  // -------- LOGIN SCREEN --------
  if (!token || !me) {
    return (
      <div style={styles.page}>
        <div style={styles.topbar}>
          <div>
            <div style={styles.brand}>{t.title}</div>
            <div style={styles.muted}>{t.subtitle}</div>
            <div style={{ ...styles.muted, marginTop: 6 }}>
              📞 {BRAND.phone} · ✉️ {BRAND.email} · {BRAND.tagline}
            </div>
          </div>
          <button style={styles.btnOutline} onClick={() => setLang(lang === "fr" ? "en" : "fr")}>
            {lang.toUpperCase()}
          </button>
        </div>

        <div style={styles.center}>
          <div style={{ ...styles.card, width: 440 }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>{t.login}</div>
            <div style={styles.field}>
              <label style={styles.label}>{t.email}</label>
              <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@lavepropre.ca" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>{t.password}</label>
              <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button style={styles.btn} onClick={doLogin}>{t.signIn}</button>
            <div style={{ ...styles.muted, marginTop: 10 }}>
              Démo : admin@lavepropre.ca / Admin!1234 · sup@lavepropre.ca / Supervisor!1234 · employe1@lavepropre.ca / Employe!1234
            </div>
          </div>
        </div>
      </div>
    );
  }

  const TopActions = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button style={styles.btnOutline} onClick={() => setLang(lang === "fr" ? "en" : "fr")}>
        {lang.toUpperCase()}
      </button>
      {canManage && (
        <a style={{ ...styles.btnOutline, textDecoration: "none" }} href={`${API_BASE}/export/hours.csv`} target="_blank" rel="noreferrer">
          {t.export}
        </a>
      )}
      <button style={styles.btnOutline} onClick={doLogout}>{t.logout}</button>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div>
          <div style={styles.brand}>{t.title}</div>
          <div style={styles.muted}>{t.subtitle}</div>
          <div style={{ ...styles.muted, marginTop: 6 }}>
            📞 {BRAND.phone} · ✉️ {BRAND.email} · {BRAND.tagline}
          </div>
          <div style={{ ...styles.muted, marginTop: 6 }}>
            {me.role} · {me.name} {(!canManage ? `· ${t.onlyMine}` : "")}
          </div>
        </div>
        {TopActions}
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={styles.tabs}>
          <button style={tabBtn(tab === "calendar")} onClick={() => setTab("calendar")}>{t.calendar}</button>
          {canManage && <button style={tabBtn(tab === "payroll")} onClick={() => setTab("payroll")}>{t.payroll}</button>}
          {isAdmin && <button style={tabBtn(tab === "access")} onClick={() => setTab("access")}>{t.access}</button>}
          {canManage && <button style={styles.btn} onClick={openNew}>{t.newShift}</button>}
        </div>

        {tab === "calendar" && (
          <Card title={t.calendar} right={<div style={styles.mutedSm}>{t.dragHint}</div>}>
            <div style={styles.week}>
              {days.map((d) => (
                <div key={d.k} style={styles.dayCol} onDrop={onDropDay(d.k)} onDragOver={onDragOver}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 900 }}>{lang === "fr" ? d.fr : d.en}</div>
                    <div style={styles.badge}>{grouped.get(d.k)?.length || 0}</div>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {(grouped.get(d.k) || []).map((s) => (
                      <div key={s.id} style={styles.shift} draggable={canManage} onDragStart={onDragStart(s.id)}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <div style={styles.mutedSm}>{hm(s.startMin)}–{hm(s.endMin)}</div>
                          <div style={styles.badge2}>{s.status}</div>
                        </div>
                        <div style={{ fontWeight: 900, marginTop: 4 }}>{s.user?.name || ""}</div>
                        <div style={styles.mutedSm}>{s.site?.name || ""}</div>
                        {s.checklist ? <div style={styles.mutedSm}>{s.checklist}</div> : null}

                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {canManage && <button style={styles.btnOutlineSm} onClick={() => openEdit(s)}>{t.edit}</button>}
                          {!canManage && s.status !== "CONFIRMED" && <button style={styles.btnOutlineSm} onClick={() => confirmMine(s.id)}>{t.confirm}</button>}
                        </div>
                      </div>
                    ))}
                    {(grouped.get(d.k) || []).length === 0 ? (
                      <div style={styles.mutedSm}>—</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "payroll" && canManage && (
          <div style={{ display: "grid", gap: 12 }}>
            <Card title={t.payroll} right={<a style={{ ...styles.btnOutline, textDecoration: "none" }} href={`${API_BASE}/export/hours.csv`} target="_blank" rel="noreferrer">{t.export}</a>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {payroll.map((p) => (
                  <div key={p.userId} style={styles.row}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{p.name}</div>
                      <div style={styles.mutedSm}>{p.email} · {money(p.rateCents)}/h</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={styles.badge}>{p.hours.toFixed(2)} h</div>
                      <div style={{ ...styles.mutedSm, marginTop: 4, fontWeight: 900 }}>{money(p.payCents)}</div>
                    </div>
                  </div>
                ))}
                {payroll.length === 0 ? <div style={styles.muted}>Aucune donnée</div> : null}
              </div>
            </Card>

            <Card title={t.employees}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {users.map((u) => (
                  <div key={u.id} style={styles.row}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{u.name}</div>
                      <div style={styles.mutedSm}>{u.email} · {u.role} · {u.employmentType || ""}</div>
                    </div>
                    <div style={styles.badge}>{u.hourlyRate ? money(u.hourlyRate) + "/h" : "—"}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === "access" && isAdmin && (
          <Card title={t.access}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select style={styles.select} value={accUserId} onChange={(e) => setAccUserId(e.target.value)}>
                  <option value="">Choisir utilisateur…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
                <select style={styles.select} value={accSiteId} onChange={(e) => setAccSiteId(e.target.value)}>
                  <option value="">Choisir site…</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button style={styles.btn} onClick={addAccess}>Ajouter accès</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {access.map((x) => (
                  <div key={x.id} style={styles.row}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{x.user.name} → {x.site.name}</div>
                      <div style={styles.mutedSm}>{x.user.email} · {x.user.role}</div>
                    </div>
                    <button style={styles.btnOutline} onClick={() => removeAccess(x.userId, x.siteId)}>Retirer</button>
                  </div>
                ))}
                {access.length === 0 ? <div style={styles.muted}>Aucun accès enregistré</div> : null}
              </div>
            </div>
          </Card>
        )}
      </div>

      <Modal open={modalOpen} title={editing ? "Modifier un quart" : "Nouveau quart"} onClose={() => setModalOpen(false)}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>Jour</label>
              <select style={styles.select} value={form.dayOfWeek} onChange={(e) => setForm((p) => ({ ...p, dayOfWeek: Number(e.target.value) }))}>
                {days.map((d) => <option key={d.k} value={d.k}>{lang === "fr" ? d.fr : d.en}</option>)}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Statut</label>
              <select style={styles.select} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="PLANNED">{t.planned}</option>
                <option value="CONFIRMED">{t.confirmed}</option>
                <option value="DONE">{t.done}</option>
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Employé</label>
              <select style={styles.select} value={form.userId} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Site</label>
              <select style={styles.select} value={form.siteId} onChange={(e) => setForm((p) => ({ ...p, siteId: e.target.value }))}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Début</label>
              <input style={styles.input} value={form.start} onChange={(e) => setForm((p) => ({ ...p, start: e.target.value }))} placeholder="08:00" />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Fin</label>
              <input style={styles.input} value={form.end} onChange={(e) => setForm((p) => ({ ...p, end: e.target.value }))} placeholder="11:00" />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Checklist / notes</label>
            <input style={styles.input} value={form.checklist} onChange={(e) => setForm((p) => ({ ...p, checklist: e.target.value }))} placeholder="Contrat 3h — AMECCI" />
          </div>

          {formErr ? <div style={styles.warn}>{formErr}</div> : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <button style={styles.btnOutline} onClick={() => setModalOpen(false)}>{t.cancel}</button>
            <div style={{ display: "flex", gap: 8 }}>
              {editing ? <button style={styles.btnOutline} onClick={deleteShift}>{t.delete}</button> : null}
              <button style={styles.btn} onClick={saveShift}>{t.save}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const tabBtn = (active) => ({
  ...styles.btnOutline,
  background: active ? "#ecfdf5" : "white",
  borderColor: active ? "#a7f3d0" : "#e5e7eb",
});

const styles = {
  page: { minHeight: "100vh", background: "linear-gradient(#ecfdf5, #ffffff)", padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", maxWidth: 1200, margin: "0 auto 14px auto" },
  brand: { fontSize: 22, fontWeight: 900 },
  muted: { color: "#4b5563", whiteSpace: "pre-line" },
  mutedSm: { color: "#6b7280", fontSize: 12 },
  center: { display: "flex", justifyContent: "center", marginTop: 60 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 },
  grid: { display: "grid", gridTemplateColumns: "1fr", gap: 12, maxWidth: 1200, margin: "0 auto" },
  card: { background: "white", borderRadius: 18, border: "1px solid #e5e7eb", padding: 14, boxShadow: "0 10px 25px rgba(0,0,0,0.04)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 },
  btn: { background: "#059669", color: "white", border: "none", padding: "10px 12px", borderRadius: 14, fontWeight: 900, cursor: "pointer" },
  btnOutline: { background: "white", border: "1px solid #e5e7eb", padding: "10px 12px", borderRadius: 14, fontWeight: 900, cursor: "pointer" },
  btnOutlineSm: { background: "white", border: "1px solid #e5e7eb", padding: "6px 10px", borderRadius: 12, fontWeight: 900, cursor: "pointer", fontSize: 12 },
  field: { display: "grid", gap: 6 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 },
  label: { fontSize: 12, color: "#6b7280", fontWeight: 800 },
  input: { padding: "10px 12px", borderRadius: 14, border: "1px solid #e5e7eb", outline: "none" },
  select: { padding: "10px 12px", borderRadius: 14, border: "1px solid #e5e7eb", outline: "none", background: "white" },
  badge: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 900 },
  badge2: { background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#111827", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 900 },
  week: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 },
  dayCol: { border: "1px solid #e5e7eb", borderRadius: 16, padding: 10, background: "rgba(255,255,255,0.7)", minHeight: 120 },
  shift: { border: "1px solid #e5e7eb", borderRadius: 16, padding: 10, background: "white" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid #e5e7eb", borderRadius: 16, padding: 10 },
  warn: { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: 10, borderRadius: 14, fontWeight: 800, fontSize: 13 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "flex", justifyContent: "center", alignItems: "center", padding: 12 },
  modal: { width: "min(720px, 100%)", background: "white", borderRadius: 18, border: "1px solid #e5e7eb", padding: 14, boxShadow: "0 30px 60px rgba(0,0,0,0.18)" },
};
