/**
 * Plaza Marqann · email sender
 * Runs as support@marqann.com (Google Apps Script web app).
 * The admin dashboard and the public registration pages POST JSON here.
 *
 * Deploy: Extensions → Apps Script (signed in as support@marqann.com) → paste →
 * Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone → copy the URL.
 */

var OWNERS = ["peterjaysonfollmann@gmail.com", "billy.jfollmann@gmail.com", "hvbplaza@gmail.com", "support@marqann.com"];
var FROM_NAME = "Plaza Marqann";
var REPLY_TO = "support@marqann.com";
var NOTIFY = ["support@marqann.com"];            // who gets the "new registration" alerts (add more addresses if you like)
var PROJECT = "marqann-admin";                    // Firebase project
var FS = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/";
var KEY = "AIzaSyAozDvcZU3DGgD7wkdN3XjIYMbrjAfDBQA"; // public web key (same one the website uses)
var LOGO = "https://marqann.com/brand/og-square.png";

function doPost(e) {
  var out = { ok: false };
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    var kind = body.kind;
    if (kind === "test" || kind === "invite_sent" || kind === "custom") {
      var who = ownerFromToken_(body.idToken);
      if (!who) throw new Error("not allowed");
      if (kind === "test") { send_(who, "Prueba · Plaza Marqann", "Este es un correo de prueba enviado desde el panel de Plaza Marqann.", "This is a test email sent from the Plaza Marqann admin panel."); }
      if (kind === "invite_sent") inviteSent_(body, who);
      if (kind === "custom") custom_(body, who);
    } else if (kind === "inbox" || kind === "thread" || kind === "reply" || kind === "archive" || kind === "unarchive" || kind === "read" || kind === "unread" || kind === "attachment" || kind === "trash") {
      var who2 = ownerFromToken_(body.idToken);
      if (!who2) throw new Error("not allowed");
      out.data = inboxOp_(kind, body, who2);
    } else if (kind === "signup_received") {
      signupReceived_(body);
    } else throw new Error("unknown kind");
    out.ok = true;
  } catch (err) { out.error = String(err && err.message || err); }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- checks ---------- */
// An owner's Firebase ID token can read config/appkey (security rules allow only the 4 owners). Anyone else gets 403.
function ownerFromToken_(idToken) {
  if (!idToken) return null;
  var r = UrlFetchApp.fetch(FS + "config/appkey?key=" + KEY, { headers: { Authorization: "Bearer " + idToken }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  try { var p = JSON.parse(Utilities.newBlob(Utilities.base64Decode(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).getDataAsString()); return (p.email || "").toLowerCase(); } catch (x) { return "owner"; }
}
// A registration link is real if invites/{token} exists and is still "sent" (public read allowed by the rules).
function inviteOf_(token) {
  if (!token || !/^[a-z0-9]{6,20}$/.test(token)) return null;
  var r = UrlFetchApp.fetch(FS + "invites/" + token + "?key=" + KEY, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var f = JSON.parse(r.getContentText()).fields || {};
  var v = function (k) { return f[k] && (f[k].stringValue || f[k].integerValue) || ""; };
  return { type: v("type"), name: v("name"), lang: v("lang"), status: v("status"), unit: v("unit") };
}

/* ---------- the emails ---------- */
function inviteSent_(b, who) {
  var es = b.lang !== "en";
  var what = b.type === "staff" ? (es ? "registro del equipo" : "staff registration") : (es ? "registro de inquilino" : "tenant registration");
  // 1. the person, if an email was given
  if (b.to && /^\S+@\S+\.\S+$/.test(b.to)) {
    send_(b.to, es ? "Plaza Marqann · tu enlace de registro" : "Plaza Marqann · your registration link",
      (b.message || "") + "\n\n" + (es ? "Si el enlace no abre, cópialo y pégalo en tu navegador." : "If the link doesn't open, copy and paste it into your browser."));
  }
  // 2. the team
  send_(NOTIFY, "Enlace de " + what + " enviado" + (b.name ? " · " + b.name : ""),
    "Enlace creado por " + who + (b.name ? " para " + b.name : "") + (b.unit ? " (local " + b.unit + ")" : "") + ".\n" +
    (b.to ? "Enviado por correo a " + b.to + ".\n" : "Enviado por WhatsApp / copiado.\n") +
    "Enlace: " + (b.link || "") + "\n\nCuando la persona complete el formulario recibirás otro correo.");
}

function signupReceived_(b) {
  var inv = inviteOf_(b.token);
  if (!inv || inv.status !== "sent") throw new Error("invalid link");
  var es = (b.lang || inv.lang) !== "en", name = String(b.name || "").slice(0, 120), first = name.split(" ")[0] || "";
  var what = inv.type === "staff" ? (es ? "equipo" : "staff") : (es ? "inquilino" : "tenant");
  // 1. confirmation to the person (only if they gave a valid email)
  if (b.email && /^\S+@\S+\.\S+$/.test(b.email)) {
    send_(b.email, es ? "Plaza Marqann · recibimos tus datos" : "Plaza Marqann · we received your details",
      es ? "Hola " + first + ",\n\nRecibimos tu registro correctamente. Nosotros nos encargamos del resto y te avisamos si falta algo.\n\nGracias,\nPlaza Marqann\nCarretera Sosúa–Cabarete km 4, Sosúa\nWhatsApp +1 (809) 993-3888"
         : "Hi " + first + ",\n\nWe received your registration. We'll take it from here and let you know if anything is missing.\n\nThank you,\nPlaza Marqann\nCarretera Sosúa–Cabarete km 4, Sosúa\nWhatsApp +1 (809) 993-3888");
  }
  // 2. the team
  send_(NOTIFY, "Nuevo registro de " + what + ": " + name + (inv.unit ? " · local " + inv.unit : ""),
    name + " completó el formulario de " + what + ".\n" + (b.email ? "Correo: " + b.email + "\n" : "") + (b.phone ? "Teléfono: " + b.phone + "\n" : "") +
    "\nRevísalo en el panel: https://marqann.com/admin/#" + (inv.type === "staff" ? "staff" : "units"));
}

function custom_(b, who) {
  if (!b.to || !b.subject) throw new Error("to and subject required");
  var opts = {};
  if (b.attachment && b.attachment.base64) opts.attachments = [Utilities.newBlob(Utilities.base64Decode(b.attachment.base64), b.attachment.type || "application/pdf", b.attachment.name || "document.pdf")];
  send_(b.to, b.subject, b.text || "", null, opts);
}

/* ---------- shared inbox (support@marqann.com) ---------- */
function inboxOp_(kind, b, who) {
  if (kind === "inbox") {
    var q = (b.q || "").trim() || "in:inbox";
    var threads = GmailApp.search(q, 0, Math.min(+b.max || 40, 80));
    return threads.map(function (t) {
      var msgs = t.getMessages(), last = msgs[msgs.length - 1], first = msgs[0];
      return { id: t.getId(), subject: t.getFirstMessageSubject() || "(no subject)", from: last.getFrom(), firstFrom: first.getFrom(), to: last.getTo(),
        date: last.getDate().toISOString(), snippet: (last.getPlainBody() || "").replace(/\s+/g, " ").slice(0, 140), unread: t.isUnread(), count: msgs.length,
        inbox: t.isInInbox(), starred: t.hasStarredMessages(), attachments: msgs.some(function (m) { return m.getAttachments({ includeInlineImages: false }).length > 0; }) };
    });
  }
  var t = GmailApp.getThreadById(b.id); if (!t) throw new Error("thread not found");
  if (kind === "thread") {
    return { id: t.getId(), subject: t.getFirstMessageSubject(), messages: t.getMessages().map(function (m) {
      return { id: m.getId(), from: m.getFrom(), to: m.getTo(), cc: m.getCc(), date: m.getDate().toISOString(), body: m.getPlainBody(), unread: m.isUnread(),
        attachments: m.getAttachments({ includeInlineImages: false }).map(function (a, i) { return { i: i, name: a.getName(), size: a.getSize(), type: a.getContentType() }; }) }; }) };
  }
  if (kind === "reply") {
    if (!b.text) throw new Error("empty reply");
    var opts = { name: FROM_NAME, replyTo: REPLY_TO, htmlBody: html_(b.text) };
    if (b.all) t.replyAll(b.text, opts); else t.reply(b.text, opts);
    return { ok: true };
  }
  if (kind === "archive") { t.moveToArchive(); return { ok: true }; }
  if (kind === "unarchive") { t.moveToInbox(); return { ok: true }; }
  if (kind === "trash") { t.moveToTrash(); return { ok: true }; }
  if (kind === "read") { t.markRead(); return { ok: true }; }
  if (kind === "unread") { t.markUnread(); return { ok: true }; }
  if (kind === "attachment") {
    var m = GmailApp.getMessageById(b.msgId), a = m.getAttachments({ includeInlineImages: false })[+b.i];
    if (!a) throw new Error("no attachment");
    return { name: a.getName(), type: a.getContentType(), base64: Utilities.base64Encode(a.getBytes()) };
  }
  throw new Error("unknown op");
}

/* ---------- plumbing ---------- */
function html_(text) {
  return "<div style='font:15px/1.55 Arial,Helvetica,sans-serif;color:#24262A;max-width:560px'>" +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(https?:\/\/\S+)/g, "<a href='$1' style='color:#1F3A2E'>$1</a>").replace(/\n/g, "<br>") +
    "<p style='margin:24px 0 0;font-size:12px;color:#6B6A64'>Plaza Marqann \u00b7 support@marqann.com \u00b7 WhatsApp +1 (809) 993-3888</p></div>";
}
function send_(to, subject, textEs, textEn, opts) {
  opts = opts || {};
  var text = textEs + (textEn ? "\n\n—\n\n" + textEn : "");
  var html = "<div style='font:15px/1.55 Arial,Helvetica,sans-serif;color:#24262A;max-width:560px'>" +
    "<img src='" + LOGO + "' alt='Plaza Marqann' width='64' height='64' style='display:block;border-radius:12px;margin:0 0 16px'>" +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(https?:\/\/\S+)/g, "<a href='$1' style='color:#1F3A2E'>$1</a>").replace(/\n/g, "<br>") +
    "<p style='margin:24px 0 0;font-size:12px;color:#6B6A64'>MARQANN, S.R.L. · Plaza Comercial Marqann · Sosúa, Puerto Plata</p></div>";
  MailApp.sendEmail({ to: Array.isArray(to) ? to.join(",") : to, subject: subject, body: text, htmlBody: html, name: FROM_NAME, replyTo: REPLY_TO, attachments: opts.attachments });
}

function doGet() { return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "Plaza Marqann mail" })).setMimeType(ContentService.MimeType.JSON); }
