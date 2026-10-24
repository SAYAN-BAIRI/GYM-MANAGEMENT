// 1. Paste your Supabase project URL and anon key (Project Settings > API)
const SUPABASE_URL = "https://kmnwbbigoueufvrztggf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImttbndiYmlnb3VldWZ2cnp0Z2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NzA4MzUsImV4cCI6MjEwODM0NjgzNX0.gN3HFXfHxVbqFJfKx0FJLxOrkFEhu219iHjVjtC6H5Y";
let sb, setupError = "";
if (SUPABASE_URL.includes("YOUR-PROJECT") || SUPABASE_KEY.includes("YOUR-ANON-KEY")) {
  setupError = "Open app.js and replace YOUR-PROJECT and YOUR-ANON-KEY at the top with your real Supabase URL and key.";
} else {
  try { sb = window.supabase.createClient(SUPABASE_URL.trim(), SUPABASE_KEY.trim()); }
  catch (e) { setupError = "Supabase did not start: " + e.message + ". Check the URL and key in app.js, and that you are online."; }
}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const iso = d => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
const opts = (rows, v, t) => rows.map(r => `<option value="${r[v]}">${esc(typeof t === "function" ? t(r) : r[t])}</option>`).join("");
const note = (m, ok) => { $("#note").innerHTML = m ? `<div class="msg ${ok ? "ok" : ""}">${esc(m)}</div>` : ""; };
const table = (heads, rows) => rows.length
  ? `<div class="wrap"><table><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`
  : `<p class="empty">Nothing here yet.</p>`;
const field = (k, label, type = "text", extra = "") => `<label>${label}<input name="${k}" type="${type}" ${extra}></label>`;
function onForm(id, fn) {
  $(id).onsubmit = async e => {
    e.preventDefault(); note("");
    try { await fn(Object.fromEntries(new FormData(e.target))); } catch (err) { note(err.message); }
  };
}

// Simple add-and-list screens
function crud(table_, title, fields, cols, heads) {
  return async () => {
    const rows = await q(sb.from(table_).select("*").order(cols[0], { ascending: false }));
    $("#view").innerHTML = `<h2>${title}</h2><div class="card"><form id="f">${
      fields.map(f => field(f.k, f.label, f.type, `${f.req ? "required" : ""} ${f.def ? `value="${f.def}"` : ""}`)).join("")
    }<button class="go">Add</button></form></div><div class="card">${table(heads, rows.map(r => cols.map(c => esc(r[c]))))}</div>`;
    onForm("#f", async v => {
      Object.keys(v).forEach(k => v[k] === "" && (v[k] = null));
      await q(sb.from(table_).insert(v)); note("Saved", true); show(title.toLowerCase());
    });
  };
}

const views = {
  async dashboard() {
    const t = today(), m = t.slice(0, 7);
    const [ms, pay, ses, att, soon, trainers] = await Promise.all([
      q(sb.from("membership").select("member_id").lte("start_date", t).gte("end_date", t)),
      q(sb.from("payment").select("amount").gte("payment_date", m + "-01")),
      q(sb.from("training_session").select("session_id").eq("session_date", t).eq("status", "Booked")),
      q(sb.from("attendance").select("attendance_id").gte("check_in", t)),
      q(sb.from("expiring_soon").select("*").order("end_date")),
      q(sb.from("trainer").select("name, training_session(session_id, status)"))
    ]);
    const work = trainers.map(x => [x.name, x.training_session.filter(s => s.status !== "Cancelled").length]);
    const max = Math.max(1, ...work.map(w => w[1]));
    $("#view").innerHTML = `<h2>Dashboard</h2><div class="grid">
      <div class="card stat"><b>${new Set(ms.map(x => x.member_id)).size}</b>Active members</div>
      <div class="card stat"><b>${pay.reduce((a, x) => a + +x.amount, 0).toLocaleString()}</b>Revenue this month</div>
      <div class="card stat"><b>${ses.length}</b>Sessions today</div>
      <div class="card stat"><b>${att.length}</b>Check-ins today</div></div>
      <div class="cols"><div class="card"><h3>Expiring in 7 days</h3>${table(["Member", "Phone", "Ends"], soon.map(x => [esc(x.name), esc(x.phone), x.end_date]))}</div>
      <div class="card"><h3>Trainer workload</h3>${work.map(w => `<div>${esc(w[0])} (${w[1]} sessions)<div class="bar" style="width:${w[1] / max * 100}%"></div></div>`).join("") || '<p class="empty">No trainers yet.</p>'}</div></div>`;
  },
  members: crud("member", "Members", [{ k: "name", label: "Name", req: 1 }, { k: "phone", label: "Phone", req: 1 }, { k: "email", label: "Email", type: "email" }], ["member_id", "name", "phone", "email", "join_date"], ["ID", "Name", "Phone", "Email", "Joined"]),
  plans: crud("membership_plan", "Plans", [{ k: "plan_name", label: "Plan name", req: 1 }, { k: "duration_days", label: "Days", type: "number", req: 1 }, { k: "price", label: "Price", type: "number", req: 1 }], ["plan_id", "plan_name", "duration_days", "price"], ["ID", "Plan", "Days", "Price"]),
  trainers: crud("trainer", "Trainers", [{ k: "name", label: "Name", req: 1 }, { k: "specialization", label: "Specialization" }, { k: "phone", label: "Phone" }], ["trainer_id", "name", "specialization", "phone"], ["ID", "Name", "Specialization", "Phone"]),

  async memberships() {
    const [mem, plans, rows] = await Promise.all([
      q(sb.from("member").select("member_id,name").order("name")),
      q(sb.from("membership_plan").select("*").order("plan_id")),
      q(sb.from("membership").select("*, member(name), membership_plan(plan_name), payment(amount)").order("membership_id", { ascending: false }))
    ]);
    const t = today();
    $("#view").innerHTML = `<h2>Memberships and payments</h2><div class="card"><form id="f">
      <label>Member<select name="member_id" required>${opts(mem, "member_id", "name")}</select></label>
      <label>Plan<select name="plan_id" required>${opts(plans, "plan_id", p => `${p.plan_name} (${p.price})`)}</select></label>
      ${field("start_date", "Start date", "date", `required value="${t}"`)}
      <label>Payment method<select name="method"><option>Cash</option><option>Card</option><option>UPI</option></select></label>
      <button class="go">Assign and record payment</button></form></div>
      <div class="card">${table(["Member", "Plan", "Start", "End", "Paid", "Status"], rows.map(r => [
        esc(r.member.name), esc(r.membership_plan.plan_name), r.start_date, r.end_date,
        r.payment.reduce((a, p) => a + +p.amount, 0),
        r.end_date < t ? "Expired" : r.start_date > t ? "Upcoming" : "Active"]))}</div>`;
    onForm("#f", async v => {
      const plan = plans.find(p => p.plan_id == v.plan_id);
      const ms = await q(sb.from("membership").insert({ member_id: v.member_id, plan_id: v.plan_id, start_date: v.start_date, end_date: addDays(v.start_date, plan.duration_days) }).select().single());
      await q(sb.from("payment").insert({ membership_id: ms.membership_id, amount: plan.price, method: v.method }));
      note("Membership assigned and payment recorded", true); show("memberships");
    });
  },

  async sessions() {
    const [mem, tr, rows] = await Promise.all([
      q(sb.from("member").select("member_id,name").order("name")),
      q(sb.from("trainer").select("trainer_id,name").order("name")),
      q(sb.from("training_session").select("*, member(name), trainer(name)").order("session_date", { ascending: false }))
    ]);
    $("#view").innerHTML = `<h2>Training sessions</h2><div class="card"><form id="f">
      <label>Member<select name="member_id" required>${opts(mem, "member_id", "name")}</select></label>
      <label>Trainer<select name="trainer_id" required>${opts(tr, "trainer_id", "name")}</select></label>
      ${field("session_date", "Date", "date", `required value="${today()}"`)}${field("start_time", "From", "time", "required")}${field("end_time", "To", "time", "required")}
      <button class="go">Book session</button></form></div>
      <div class="card"><div id="cal"></div></div>
      <div class="card">${table(["Date", "Time", "Member", "Trainer", "Status", ""], rows.map(r => [r.session_date, r.start_time.slice(0, 5) + "-" + r.end_time.slice(0, 5), esc(r.member.name), esc(r.trainer.name), r.status,
        r.status === "Booked" ? `<button class="sm" data-cancel="${r.session_id}">Cancel</button>` : ""]))}</div>`;
    new FullCalendar.Calendar($("#cal"), {
      initialView: "dayGridMonth", height: "auto",
      headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" },
      events: rows.filter(r => r.status !== "Cancelled").map(r => ({ title: `${r.member.name} / ${r.trainer.name}`, start: `${r.session_date}T${r.start_time}`, end: `${r.session_date}T${r.end_time}`, color: r.status === "Completed" ? "#1f8a5b" : "#e0561f" }))
    }).render();
    document.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => {
      await q(sb.from("training_session").update({ status: "Cancelled" }).eq("session_id", b.dataset.cancel)); show("sessions");
    });
    onForm("#f", async v => { await q(sb.from("training_session").insert(v)); note("Session booked", true); show("sessions"); });
  },

  async attendance() {
    const [mem, rows] = await Promise.all([
      q(sb.from("member").select("member_id,name").order("name")),
      q(sb.from("attendance").select("*, member(name)").order("check_in", { ascending: false }).limit(200))
    ]);
    const visits = {}; rows.forEach(r => visits[r.member.name] = (visits[r.member.name] || 0) + 1);
    $("#view").innerHTML = `<h2>Attendance</h2><div class="card"><form id="f">
      <label>Member<select name="member_id" required>${opts(mem, "member_id", "name")}</select></label><button class="go">Check in</button></form></div>
      <div class="cols"><div class="card"><h3>Recent check-ins</h3>${table(["Member", "Time"], rows.slice(0, 15).map(r => [esc(r.member.name), new Date(r.check_in).toLocaleString()]))}</div>
      <div class="card"><h3>Visits per member</h3>${table(["Member", "Visits"], Object.entries(visits).map(([n, c]) => [esc(n), c]))}</div></div>`;
    onForm("#f", async v => {
      const t = today();
      const ok = await q(sb.from("membership").select("membership_id").eq("member_id", v.member_id).lte("start_date", t).gte("end_date", t));
      if (!ok.length) throw new Error("Check-in failed: this member has no active membership.");
      await q(sb.from("attendance").insert({ member_id: v.member_id })); note("Checked in", true); show("attendance");
    });
  }
};

const labels = { dashboard: "Dashboard", members: "Members", plans: "Plans", memberships: "Memberships", trainers: "Trainers", sessions: "Sessions", attendance: "Attendance" };
$("#nav").innerHTML += Object.entries(labels).map(([k, v]) => `<button data-t="${k}">${v}</button>`).join("");
$("#nav").onclick = e => e.target.dataset.t && (note(""), show(e.target.dataset.t));
function show(t) {
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  if (setupError) { $("#view").innerHTML = ""; note(setupError); return; }
  $("#view").innerHTML = '<p class="empty">Loading...</p>';
  views[t]().catch(e => { $("#view").innerHTML = ""; note(e.message); });
}
show("dashboard");
