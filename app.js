/* =========================
   Gator Hoops — App Script
   ========================= */

/*** CONFIG ***/
const TEAM_ID = 57; // Florida Gators
let   GENDER  = "mens-college-basketball"; // switch via dropdown

/* Championship photos (swap freely; YouTube thumbs are hotlink-friendly) */
const CHAMPIONSHIP_PHOTOS = [
  "https://img.youtube.com/vi/igDpFxg60qU/maxresdefault.jpg",
  "https://img.youtube.com/vi/ww6n-Y9ygeg/maxresdefault.jpg",
  "https://img.youtube.com/vi/kuPmLVeXXac/maxresdefault.jpg",
  "https://img.youtube.com/vi/2Skv3IYAdUE/maxresdefault.jpg"
];
/*** END CONFIG ***/

const BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball";
const GOOGLE_IMPORT_URL = "https://calendar.google.com/calendar/u/0/r/settings/import";

/* Shortcuts */
const $ = (q)=>document.querySelector(q);
const scheduleList = $("#scheduleList");
const rosterList   = $("#rosterList");
const refreshBtn   = $("#refreshBtn");
const genderSelect = $("#gender");

/* Carousel */
const heroImg = $("#heroImg");
const prevBtn = $("#prevBtn");
const nextBtn = $("#nextBtn");
let heroIndex = 0;
function setHero(idx){
  const arr = CHAMPIONSHIP_PHOTOS;
  if(!arr.length){
    heroImg.src = "https://upload.wikimedia.org/wikipedia/commons/0/08/Florida_Gators_gator_logo.svg";
    heroImg.style.objectFit="contain"; return;
  }
  heroIndex = (idx+arr.length)%arr.length;
  heroImg.src = arr[heroIndex];
}
prevBtn.addEventListener("click", ()=> setHero(heroIndex-1));
nextBtn.addEventListener("click", ()=> setHero(heroIndex+1));

/* Tabs */
function activateTab(which){
  const isSchedule = which==="schedule";
  $("#tab-schedule").setAttribute("aria-selected", String(isSchedule));
  $("#tab-roster").setAttribute("aria-selected", String(!isSchedule));
  $("#panel-schedule").classList.toggle("active", isSchedule);
  $("#panel-roster").classList.toggle("active", !isSchedule);
}
$("#tab-schedule").addEventListener("click", ()=> activateTab("schedule"));
$("#tab-roster").addEventListener("click",   ()=> activateTab("roster"));

/* Utils */
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined,{dateStyle:"medium", timeStyle:"short"});
}
function el(html){ const div=document.createElement('div'); div.innerHTML=html.trim(); return div.firstChild; }
async function getJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error("HTTP "+res.status);
  return res.json();
}
function toGCalDate(dt){ // YYYYMMDDTHHMMSSZ
  return dt.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
}
function addHours(date, hours){
  const d = new Date(date.getTime()); d.setHours(d.getHours()+hours); return d;
}
function isIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isAndroid(){ return /Android/.test(navigator.userAgent); }
function isDesktop(){ return !isIOS() && !isAndroid(); }

/* Countdown + Notifications */
function msUntil(date){ return +date - Date.now(); }
function formatCountdown(ms){
  if (ms <= 0) return "Tip-off!";
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), ss = s%60;
  if (d>0) return `${d}d ${h}h ${m}m`;
  if (h>0) return `${h}h ${m}m ${ss}s`;
  return `${m}m ${ss}s`;
}
async function requestNotifyPermission(){
  if (!("Notification" in window)) { alert("Notifications not supported in this browser."); return false; }
  if (Notification.permission === "granted") return true;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

/* ESPN parsing */
function parseSchedule(data){
  const events = data?.events ?? [];
  return events.map((ev)=>{
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find(c=>c.homeAway==="home");
    const away = competitors.find(c=>c.homeAway==="away");
    const isHome = String(home?.team?.id)===String(TEAM_ID);
    const selfSide = isHome ? home : away;
    const oppSide  = isHome ? away : home;

    const statusType = comp?.status?.type;
    const status = statusType?.shortDetail || statusType?.description || "Scheduled";

    const oppTeam = oppSide?.team ?? {};
    const logo    = oppTeam?.logos?.[0]?.href;

    const myScore  = Number(selfSide?.score);
    const oppScore = Number(oppSide?.score);

    return {
      id: ev.id, date: ev.date,
      opponent: oppTeam.displayName ?? "Opponent",
      isHome,
      venue: comp?.venue?.fullName,
      tv: comp?.broadcasts?.[0]?.names?.[0],
      status,
      myScore: isNaN(myScore)?undefined:myScore,
      oppScore: isNaN(oppScore)?undefined:oppScore,
      opponentLogo: logo
    };
  }).sort((a,b)=> new Date(a.date)-new Date(b.date));
}
function parseRoster(data){
  const groups = data?.team?.athletes ?? [];
  const players = [];
  for(const group of groups){
    for(const it of (group.items??[])){
      let stats = { ppg:0,rpg:0,apg:0,fgp:0,tpp:0,ftp:0,spg:0,bpg:0,topg:0,mpg:0 };
      const season = (it.statistics??[]).find(s => String(s.name||"").toLowerCase().includes("season"));
      const cats = season?.splits?.categories ?? [];
      for(const cat of cats){
        for(const st of (cat.stats??[])){
          const nm = st.name, val = Number(st.value);
          if(nm==="pointsPerGame") stats.ppg = val;
          if(nm==="reboundsPerGame") stats.rpg = val;
          if(nm==="assistsPerGame") stats.apg = val;
          if(nm==="fieldGoalPct")   stats.fgp = val;
          if(nm==="threePointPct")  stats.tpp = val;
          if(nm==="freeThrowPct")   stats.ftp = val;
          if(nm==="stealsPerGame")  stats.spg = val;
          if(nm==="blocksPerGame")  stats.bpg = val;
          if(nm==="turnoversPerGame") stats.topg = val;
          if(nm==="minutesPerGame") stats.mpg = val;
        }
      }
      players.push({
        id:String(it.id),
        fullName: it.displayName,
        position: it.position?.abbreviation,
        number: it.jersey,
        classYear: it.class,
        headshot: it.headshot?.href,
        stats
      });
    }
  }
  players.sort((a,b)=> a.fullName.localeCompare(b.fullName));
  return players;
}

/* Predictions (toy Elo) */
function buildElo(games){
  let elo = 1500, K = 18;
  for(const g of games){
    if(g.myScore!=null && g.oppScore!=null){
      const diff = g.myScore - g.oppScore;
      const result = diff>0 ? 1 : diff<0 ? 0 : 0.5;
      const exp = 1/(1+Math.pow(10, (1500-elo)/400));
      const margin = Math.min(10, Math.abs(diff))/10;
      elo = elo + K * (result - exp) * (1 + margin*0.6);
    }
  }
  return elo;
}
function predictWinProb(eloSelf, isHome){
  const homeEdge = isHome ? 50 : 0;
  const oppElo = 1500;
  return 1/(1+Math.pow(10, ((oppElo - (eloSelf+homeEdge))/400)));
}

/* Calendar: per-game links */
function calendarPayload(game){
  const title = `Florida Gators ${game.isHome ? "vs" : "@"} ${game.opponent}`;
  const start = new Date(game.date);
  const end   = addHours(start, 2);
  const loc   = game.venue || "TBD";
  const details = `TV: ${game.tv||"TBD"} — Auto-generated from Gator Hoops`;

  const uid = `${game.id}@gatorhoops`;
  const dtStart = toGCalDate(start);
  const dtEnd   = toGCalDate(end);
  const ics = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GatorHoops//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toGCalDate(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title.replace(/[\r\n]/g," ")}`,
    `DESCRIPTION:${details.replace(/[\r\n]/g," ")}`,
    `LOCATION:${loc.replace(/[\r\n]/g," ")}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const icsUrl = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));

  const gcal = new URL("https://www.google.com/calendar/render");
  gcal.searchParams.set("action","TEMPLATE");
  gcal.searchParams.set("text",title);
  gcal.searchParams.set("dates",`${dtStart}/${dtEnd}`);
  gcal.searchParams.set("details",details);
  gcal.searchParams.set("location",loc);
  gcal.searchParams.set("sf","true");
  gcal.searchParams.set("output","xml");

  const outlook = new URL("https://outlook.live.com/calendar/0/deeplink/compose");
  outlook.searchParams.set("subject", title);
  outlook.searchParams.set("startdt", start.toISOString());
  outlook.searchParams.set("enddt", end.toISOString());
  outlook.searchParams.set("body", details);
  outlook.searchParams.set("location", loc);

  return { icsUrl, gcalUrl: gcal.toString(), outlookUrl: outlook.toString(), suggestedFilename: `${title.replace(/\s+/g,'_')}.ics` };
}
function calendarMenu(game){
  const links = calendarPayload(game);
  const wrap = el(`
    <div class="cal-wrap">
      <button class="cal-btn">Add to Calendar ▾</button>
      <div class="cal-menu">
        <a href="${links.icsUrl}" download="${links.suggestedFilename}"> Apple Calendar (.ics)</a>
        <a href="${links.gcalUrl}" target="_blank" rel="noopener">Google Calendar</a>
        <a href="${links.outlookUrl}" target="_blank" rel="noopener">Outlook (web)</a>
      </div>
    </div>
  `);
  const btn = wrap.querySelector(".cal-btn");
  const menu = wrap.querySelector(".cal-menu");
  btn.addEventListener("click", (e)=>{
    e.stopPropagation();
    menu.style.display = (menu.style.display==="block" ? "none" : "block");
  });
  document.addEventListener("click", ()=> menu.style.display="none");
  return wrap;
}

/* Add ALL games (smart) */
function buildAllGamesICS(games){
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GatorHoops//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  for(const g of games){
    const start = new Date(g.date);
    const end = addHours(start, 2);
    const title = `Florida Gators ${g.isHome ? "vs" : "@"} ${g.opponent}`;
    const loc = g.venue || "TBD";
    const desc = `TV: ${g.tv||"TBD"} — Auto-generated from Gator Hoops`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${g.id}@gatorhoops`,
      `DTSTAMP:${toGCalDate(new Date())}`,
      `DTSTART:${toGCalDate(start)}`,
      `DTEND:${toGCalDate(end)}`,
      `SUMMARY:${title.replace(/[\r\n]/g," ")}`,
      `DESCRIPTION:${desc.replace(/[\r\n]/g," ")}`,
      `LOCATION:${loc.replace(/[\r\n]/g," ")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}
function wireAddAllSmart(){
  const btn = document.getElementById("addAllBtn");
  const menuWrap = document.getElementById("allcal-menu");
  const menuApple = document.getElementById("allcal-apple");

  btn.addEventListener("click", ()=>{
    const games = window._latestGames || [];
    if(!games.length){ alert("Load the schedule first!"); return; }
    const icsUrl = buildAllGamesICS(games);

    if(isIOS()){
      const a = document.createElement("a"); a.href = icsUrl; a.download = "Gator_Hoops_Schedule.ics"; a.click(); return;
    }
    if(isAndroid()){
      window.open(GOOGLE_IMPORT_URL, "_blank", "noopener");
      const a = document.createElement("a"); a.href = icsUrl; a.download = "Gator_Hoops_Schedule.ics"; a.click(); return;
    }
    // Desktop: show small menu; wire Apple link to the fresh blob
    menuWrap.classList.toggle("open");
    menuApple.onclick = (e)=>{ e.preventDefault(); const a = document.createElement("a"); a.href = icsUrl; a.download = "Gator_Hoops_Schedule.ics"; a.click(); menuWrap.classList.remove("open"); };
    document.addEventListener("click", (ev)=>{ if(!menuWrap.contains(ev.target) && ev.target!==btn) menuWrap.classList.remove("open"); });
  });
}

/* Next Game card (with countdown + .ics w/ 1h alarm + browser notification) */
let countdownTimer = null;
function icsWithAlarm(game){
  const title = `Florida Gators ${game.isHome ? "vs" : "@"} ${game.opponent}`;
  const start = new Date(game.date);
  const end   = addHours(start, 2);
  const lines = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GatorHoops//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${game.id}@gatorhoops`,
    `DTSTAMP:${toGCalDate(new Date())}`,
    `DTSTART:${toGCalDate(start)}`,
    `DTEND:${toGCalDate(end)}`,
    `SUMMARY:${title.replace(/[\r\n]/g," ")}`,
    `DESCRIPTION:${`TV: ${game.tv||"TBD"} — Auto-generated from Gator Hoops`.replace(/[\r\n]/g," ")}`,
    `LOCATION:${(game.venue||"TBD").replace(/[\r\n]/g," ")}`,
      "BEGIN:VALARM","TRIGGER:-PT60M","ACTION:DISPLAY","DESCRIPTION:Game starting in 1 hour","END:VALARM",
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([lines],{type:"text/calendar;charset=utf-8"}));
  const filename = `${title.replace(/\s+/g,'_')}.ics`;
  return { url, filename };
}
function getNextGame(games){
  const now = Date.now();
  return games.find(g => new Date(g.date).getTime() > now) || null;
}
function renderNextGameCard(game){
  const wrap = document.getElementById("nextGame");
  wrap.innerHTML = "";
  if (!game) { wrap.innerHTML = `<div class="note">No upcoming games found.</div>`; return; }

  const start = new Date(game.date);
  const card = el(`
    <div class="next-card">
      ${game.opponentLogo ? `<img class="logo" alt="" src="${game.opponentLogo}">` : `<div class="logo"></div>`}
      <div class="next-left">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="font-weight:800">Next: ${game.isHome ? "vs" : "@"} ${game.opponent}</div>
          ${game.tv ? `<span class="pill"><span class="pill-dot"></span>${game.tv}</span>` : ""}
          ${game.venue ? `<span class="pill gray"><span class="pill-dot"></span>${game.venue}</span>` : ""}
        </div>
        <div class="meta">${fmtDate(game.date)}</div>
        <div id="cd" class="countdown">—</div>
        <div class="next-actions">
          <button id="notifyBtn" class="btn">Remind me 1h before</button>
          <button id="addNextBtn" class="btn primary">Add next game (1h alert)</button>
        </div>
        <div class="note">Tip: Adding to Calendar includes a guaranteed 60-minute alert.</div>
      </div>
    </div>
  `);
  wrap.appendChild(card);

  // countdown
  const cd = card.querySelector("#cd");
  function tick(){ cd.textContent = formatCountdown(msUntil(start)); }
  tick();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 1000);

  // .ics with alarm
  card.querySelector("#addNextBtn").addEventListener("click", ()=>{
    const { url, filename } = icsWithAlarm(game);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  });

  // browser notify (while page open)
  card.querySelector("#notifyBtn").addEventListener("click", async ()=>{
    const ok = await requestNotifyPermission();
    if (!ok) { alert("Please allow notifications."); return; }
    const ms = msUntil(new Date(start.getTime() - 60*60*1000));
    if (ms <= 0) { new Notification("Gators tip-off soon!"); return; }
    const btn = card.querySelector("#notifyBtn");
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Scheduled`;
    setTimeout(()=>{ new Notification("Gators tip-off in 60 minutes! 🐊"); }, ms);
  });
}

/* Renderers */
function renderSchedule(list){
  scheduleList.innerHTML = "";
  window._latestGames = list;           // used by Add-All
  renderNextGameCard(getNextGame(list)); // next game card

  const completed = list.filter(g => g.myScore!=null && g.oppScore!=null);
  const elo = buildElo(completed);

  for(const g of list){
    const right = (g.myScore!=null && g.oppScore!=null) ? `<div class="score">${g.myScore}-${g.oppScore}</div>` : `<div class="meta">${g.status}</div>`;
    const tv = g.tv ? `<span class="pill"><span class="pill-dot"></span>${g.tv}</span>` : "";
    const venue = g.venue ? `<span class="pill gray"><span class="pill-dot"></span>${g.venue}</span>` : "";

    let pred = "";
    if(g.myScore==null || g.oppScore==null){
      const p = predictWinProb(elo, g.isHome);
      pred = `<div class="pred">Prediction: <b>${Math.round(p*100)}%</b> win</div>`;
    }

    const card = el(`
      <div class="card">
        <div class="row">
          ${g.opponentLogo ? `<img class="logo" alt="" src="${g.opponentLogo}">` : `<div class="logo"></div>`}
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <div style="font-weight:800">${g.isHome ? "vs" : "@"} ${g.opponent}</div>
              ${tv} ${venue}
            </div>
            <div class="meta">${fmtDate(g.date)}</div>
            ${pred}
          </div>
          <div class="right">${right}</div>
        </div>
        <div class="card-actions"></div>
      </div>
    `);

    // Per-game Add-to-Calendar menu
    card.querySelector(".card-actions").appendChild(calendarMenu(g));
    scheduleList.append(card);
  }
}
function renderRoster(players){
  rosterList.innerHTML="";
  if(!players.length){ rosterList.append(el(`<div class="meta">No players found.</div>`)); return; }
  for(const p of players){
    const s = p.stats || {};
    rosterList.append(el(`
      <div class="card">
        <div class="row">
          ${p.headshot ? `<img class="head" alt="" src="${p.headshot}">` : `<div class="head"></div>`}
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <div style="font-weight:800">${p.fullName}</div>
              <span class="meta">${p.number?("#"+p.number+" "):""}${p.position ?? ""} ${p.classYear?("· "+p.classYear):""}</span>
            </div>
            <div class="statgrid">
              <div class="stat"><div class="t">PPG</div><div class="v">${(s.ppg??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">RPG</div><div class="v">${(s.rpg??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">APG</div><div class="v">${(s.apg??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">FG%</div><div class="v">${(s.fgp??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">3P%</div><div class="v">${(s.tpp??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">FT%</div><div class="v">${(s.ftp??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">STL</div><div class="v">${(s.spg??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">BLK</div><div class="v">${(s.bpg??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">TO</div><div class="v">${(s.topg??0).toFixed(1)}</div></div>
              <div class="stat"><div class="t">MIN</div><div class="v">${(s.mpg??0).toFixed(1)}</div></div>
            </div>
          </div>
        </div>
      </div>
    `));
  }
}

/* Controller */
async function loadAll(){
  try{
    refreshBtn.disabled = true; refreshBtn.textContent = "Loading…";
    setHero(0);

    const sched = await getJSON(`${BASE}/${GENDER}/teams/${TEAM_ID}/schedule`);
    renderSchedule(parseSchedule(sched));

    const roster = await getJSON(`${BASE}/${GENDER}/teams/${TEAM_ID}`);
    renderRoster(parseRoster(roster));
  }catch(err){
    scheduleList.innerHTML = `<div class="meta" style="color:#c1121f">Error: ${err}</div>`;
    rosterList.innerHTML   = `<div class="meta" style="color:#c1121f">Error: ${err}</div>`;
  }finally{
    refreshBtn.disabled = false; refreshBtn.textContent = "↻ Refresh";
  }
}

/* Init */
document.addEventListener("DOMContentLoaded", ()=>{
  activateTab("schedule");
  setHero(0);
  wireAddAllSmart();
  loadAll();
});
refreshBtn.addEventListener("click", loadAll);
genderSelect.addEventListener("change", (e)=>{ GENDER = e.target.value; loadAll(); });
