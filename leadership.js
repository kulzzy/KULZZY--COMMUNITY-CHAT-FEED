/* =====================================================
   KULZZY UNIVERSAL LEADERSHIP CHALLENGE
   Separate module — reuses the existing Firebase app
   ===================================================== */

import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  get,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* =====================================================
   1. CONFIGURATION
   ===================================================== */

const ADMIN_UID = "J5bniEYbkIaDLmn4RPBbAC7crf23";

const app = getApp();
const db = getDatabase(app);
const auth = getAuth(app);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentDate = getNigeriaDate();
let currentEntries = {};
let currentResults = null;
let currentClosed = false;
let myVote = null;
let myEntry = null;
let listenersStarted = false;


/* =====================================================
   2. NIGERIA DATE — AFRICA/LAGOS
   ===================================================== */

function getNigeriaDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  parts.forEach(part => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}


/* =====================================================
   3. SAFE HTML OUTPUT
   ===================================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}


function safePhoto(photo) {
  const value = String(photo || "").trim();

  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) {
    return escapeHTML(value);
  }

  return "";
}


function showMessage(elementId, message) {
  const element = $(elementId);

  if (element) {
    element.textContent = message;
  }
}


/* =====================================================
   4. TITLE AND POSITION LABELS
   ===================================================== */

function getPositionLabel(rank) {
  if (rank === 1) return "🥇 Universal President of the Day";

  if (rank === 2) return "🥈 Universal Vice President of the Day";

  if (rank === 3) return "🥉 Universal Senate President of the Day";

  if (rank >= 4 && rank <= 103) {
    return `No. ${rank - 3} LGC`;
  }

  return "Regular Community Member";
}


/* =====================================================
   5. PROFILE INFORMATION
   ===================================================== */

async function getMyProfile() {
  if (!currentUser) {
    throw new Error("Please sign in to your community account.");
  }

  const snapshot = await get(
    ref(db, "profiles/" + currentUser.uid)
  );

  if (!snapshot.exists()) {
    throw new Error("Your community profile was not found. Complete your profile first.");
  }

  const profile = snapshot.val() || {};

  const name = String(profile.name || "").trim();
  const username = String(profile.username || "").trim();
  const photo = String(profile.photo || "").trim();

  if (!name) {
    throw new Error("Your saved profile does not contain a display name.");
  }

  if (typeof profile.photo !== "string") {
    throw new Error("Your saved profile photo field is missing. Please save your community profile again before joining.");
  }

  return {
    uid: currentUser.uid,
    name,
    username,
    photo,
    searchName: name.toLowerCase(),
    searchUsername: username.toLowerCase(),
    joinedAt: Date.now()
  };
}


/* =====================================================
   6. JOIN THE DAILY CHALLENGE
   ===================================================== */

async function joinChallenge() {
  if (!currentUser) {
    showMessage("klcMyStatus", "Please sign in to your community account first.");
    return;
  }

  const button = $("klcJoinBtn");
  button.disabled = true;
  button.textContent = "JOINING...";

  try {
    const profile = await getMyProfile();

    const entryRef = ref(
      db,
      `leadershipDailyEntries/${currentDate}/${currentUser.uid}`
    );

    const existing = await get(entryRef);

    if (existing.exists()) {
      showMessage("klcMyStatus", "You have already joined today's leadership challenge.");
      return;
    }

    if (currentClosed) {
      throw new Error("Today's voting has been closed. You cannot join this challenge now.");
    }

    await set(entryRef, profile);

    showMessage("klcMyStatus", "You have successfully entered today's leadership challenge!");
  } catch (error) {
    showMessage("klcMyStatus", error.message || "Unable to join. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "CONTEST FOR LEADERSHIP";
  }
}


/* =====================================================
   7. LOAD TODAY'S ENTRIES
   ===================================================== */

function startEntryListener() {
  onValue(
    ref(db, "leadershipDailyEntries/" + currentDate),
    snapshot => {
      currentEntries = snapshot.val() || {};

      if (currentUser) {
        myEntry = currentEntries[currentUser.uid] || null;
      }

      renderContestants();
      renderMyStatus();
    },
    error => {
      showMessage("klcContestants", "Unable to load contestants: " + error.message);
    }
  );
}


/* =====================================================
   8. LOAD VOTING STATUS
   ===================================================== */

function startSettingsListener() {
  onValue(
    ref(db, "leadershipDailySettings/" + currentDate + "/closed"),
    snapshot => {
      currentClosed = snapshot.val() === true;

      showMessage(
        "klcDateStatus",
        currentClosed
          ? `Nigeria date: ${currentDate} — VOTING CLOSED`
          : `Nigeria date: ${currentDate} — VOTING OPEN`
      );

      renderContestants();
      renderMyStatus();
    }
  );
}


/* =====================================================
   9. LOAD MY PRIVATE VOTE RECORD
   ===================================================== */

function startMyVoteListener() {
  if (!currentUser) return;

  onValue(
    ref(db, `leadershipDailyVotes/${currentDate}/${currentUser.uid}`),
    snapshot => {
      myVote = snapshot.val() || null;
      renderContestants();
      renderMyStatus();
    }
  );
}


/* =====================================================
   10. LOAD PUBLISHED RESULTS
   ===================================================== */

function startResultsListener() {
  onValue(
    ref(db, "leadershipDailyResults/" + currentDate),
    snapshot => {
      currentResults = snapshot.val() || null;
      renderTopThree();
      renderResults();
    }
  );
}


/* =====================================================
   11. GET RANKED CONTESTANTS
   ===================================================== */

function getRankedContestants() {
  if (!currentResults || !currentResults.rankings) {
    return [];
  }

  return Object.values(currentResults.rankings)
    .filter(item => item && item.uid)
    .sort((a, b) => Number(a.rank) - Number(b.rank));
}


/* =====================================================
   12. RENDER TOP THREE
   ===================================================== */

function renderTopThree() {
  const container = $("klcTopThree");
  const rankings = getRankedContestants().slice(0, 3);

  if (!rankings.length) {
    container.innerHTML =
      '<div class="klc-empty">The top three leaders will appear after official results are published.</div>';
    return;
  }

  container.innerHTML = rankings.map(person => {
    const photo = safePhoto(person.photo);

    return `
      <div class="klc-top-card">
        ${photo ? `<img src="${photo}" alt="" loading="lazy">` : ""}
        <strong>${escapeHTML(person.name)}</strong>
        <small>${escapeHTML(getPositionLabel(Number(person.rank)))}</small>
        <small>${Number(person.votes || 0)} votes</small>
      </div>
    `;
  }).join("");
}


/* =====================================================
   13. RENDER CONTESTANT LIST
   ===================================================== */

function renderContestants() {
  const container = $("klcContestants");

  const search = String($("klcSearch").value || "")
    .trim()
    .toLowerCase();

  const contestants = Object.values(currentEntries);

  const filtered = contestants
    .filter(person => {
      const name = String(person.name || "").toLowerCase();
      const username = String(person.username || "").toLowerCase();

      return !search ||
        name.startsWith(search) ||
        username.startsWith(search);
    })
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""))
    );

  if (!filtered.length) {
    container.innerHTML =
      '<div class="klc-empty">No matching contestants found.</div>';
    return;
  }

  container.innerHTML = filtered.map(person => {
    const photo = safePhoto(person.photo);

    const alreadyVoted = Boolean(myVote);
    const isMe = currentUser && person.uid === currentUser.uid;

    let buttonHTML = "";

    if (isMe) {
      buttonHTML = '<span class="klc-small">Your entry</span>';
    } else if (currentClosed) {
      buttonHTML = '<span class="klc-small">Voting closed</span>';
    } else if (!currentUser) {
      buttonHTML = '<span class="klc-small">Sign in to vote</span>';
    } else if (alreadyVoted) {
      buttonHTML = '<span class="klc-small">Daily vote used</span>';
    } else {
      buttonHTML = `
        <button
          class="klc-vote"
          type="button"
          data-candidate="${escapeHTML(person.uid)}"
        >VOTE</button>
      `;
    }

    return `
      <div class="klc-card">
        ${photo ? `<img src="${photo}" alt="" loading="lazy">` : ""}
        <div class="klc-person">
          <div class="klc-name">${escapeHTML(person.name)}</div>
          <div class="klc-small">${person.username ? "@" + escapeHTML(person.username) : ""}</div>
        </div>
        ${buttonHTML}
      </div>
    `;
  }).join("");
}


/* =====================================================
   14. CAST ONE DAILY VOTE
   ===================================================== */

async function castVote(candidateUid) {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  if (candidateUid === currentUser.uid) {
    alert("You cannot vote for yourself.");
    return;
  }

  if (currentClosed) {
    alert("Voting is closed.");
    return;
  }

  if (myVote) {
    alert("You have already used your vote for today.");
    return;
  }

  if (!currentEntries[candidateUid]) {
    alert("This contestant is no longer available.");
    return;
  }

  const confirmed = confirm(
    "Submit your one free vote for this contestant today?"
  );

  if (!confirmed) return;

  try {
    const voteRef = ref(
      db,
      `leadershipDailyVotes/${currentDate}/${currentUser.uid}`
    );

    const existing = await get(voteRef);

    if (existing.exists()) {
      myVote = existing.val();
      renderContestants();
      alert("Your daily vote has already been used.");
      return;
    }

    await set(voteRef, {
      candidateUid,
      createdAt: Date.now()
    });

    alert("Your vote has been submitted successfully!");
  } catch (error) {
    alert("Vote was not accepted: " + error.message);
  }
}


/* =====================================================
   15. SHOW MY STATUS
   ===================================================== */

function renderMyStatus() {
  if (!currentUser) {
    showMessage("klcMyStatus", "Sign in to join and vote in the challenge.");
    return;
  }

  if (myEntry) {
    if (myVote) {
      showMessage("klcMyStatus", "You have entered and used your one free vote for today.");
    } else if (currentClosed) {
      showMessage("klcMyStatus", "You entered today's challenge. Voting is now closed.");
    } else {
      showMessage("klcMyStatus", "You are a contestant today. You may cast one free vote for another contestant.");
    }

    $("klcJoinBtn").textContent = "YOU HAVE ENTERED TODAY";
    $("klcJoinBtn").disabled = true;
  } else if (currentClosed) {
    showMessage("klcMyStatus", "Today's challenge is closed to new entries and votes.");
    $("klcJoinBtn").disabled = true;
    $("klcJoinBtn").textContent = "TODAY'S CHALLENGE CLOSED";
  } else {
    showMessage("klcMyStatus", "You have not entered today's challenge yet.");
    $("klcJoinBtn").disabled = false;
    $("klcJoinBtn").textContent = "CONTEST FOR LEADERSHIP";
  }

  renderContestants();
}


/* =====================================================
   16. RENDER OFFICIAL RESULTS
   ===================================================== */

function renderResults() {
  const container = $("klcResults");
  const rankings = getRankedContestants();

  if (!currentResults || !rankings.length) {
    container.innerHTML =
      '<div class="klc-empty">Today's official results have not been published.</div>';
    return;
  }

  const status = currentResults.closed
    ? "FINAL RESULTS — VOTING CLOSED"
    : "PUBLISHED RESULTS — VOTING OPEN";

  container.innerHTML = `
    <div class="klc-status">
      ${escapeHTML(status)}
    </div>
    ${rankings.map(person => {
      const photo = safePhoto(person.photo);
      const rank = Number(person.rank);

      return `
        <div class="klc-card">
          ${photo ? `<img src="${photo}" alt="" loading="lazy">` : ""}
          <div class="klc-person">
            <div class="klc-name">
              ${rank}. ${escapeHTML(person.name)}
            </div>
            <div class="klc-rank">
              ${escapeHTML(getPositionLabel(rank))}
            </div>
            <div class="klc-small">
              ${Number(person.votes || 0)} votes
            </div>
          </div>
        </div>
      `;
    }).join("")}
  `;
}


/* =====================================================
   17. ADMIN — CALCULATE PRIVATE VOTE TOTALS
   ===================================================== */

async function calculateRankings() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    throw new Error("Administrator access required.");
  }

  const entriesSnapshot = await get(
    ref(db, "leadershipDailyEntries/" + currentDate)
  );

  const votesSnapshot = await get(
    ref(db, "leadershipDailyVotes/" + currentDate)
  );

  const entries = entriesSnapshot.val() || {};
  const votes = votesSnapshot.val() || {};

  const totals = {};

  Object.keys(entries).forEach(uid => {
    totals[uid] = 0;
  });

  Object.values(votes).forEach(vote => {
    if (vote && totals[vote.candidateUid] !== undefined) {
      totals[vote.candidateUid]++;
    }
  });

  const contestants = Object.values(entries).map(person => ({
    uid: person.uid,
    name: person.name || "",
    username: person.username || "",
    photo: person.photo || "",
    votes: totals[person.uid] || 0
  }));

  contestants.sort((a, b) => {
    if (b.votes !== a.votes) {
      return b.votes - a.votes;
    }

    return String(a.name).localeCompare(String(b.name));
  });

  const rankings = {};

  contestants.forEach((person, index) => {
    const rank = index + 1;

    rankings[person.uid] = {
      ...person,
      rank,
      position: getPositionLabel(rank)
    };
  });

  return {
    date: currentDate,
    closed: currentClosed,
    updatedAt: Date.now(),
    totalContestants: contestants.length,
    rankings
  };
}


/* =====================================================
   18. ADMIN — DISPLAY PRIVATE TOTALS
   ===================================================== */

async function viewPrivateVotes() {
  try {
    const result = await calculateRankings();

    const contestants = Object.values(result.rankings);

    $("klcAdminPreview").innerHTML = `
      <div class="klc-section-title">
        PRIVATE ADMIN VOTE TOTALS
      </div>
      ${contestants.map(person => `
        <div class="klc-card">
          <div class="klc-person">
            <div class="klc-name">
              ${person.rank}. ${escapeHTML(person.name)}
            </div>
            <div class="klc-small">
              ${escapeHTML(person.username)}
            </div>
          </div>
          <strong style="color:#ffd700">
            ${person.votes}
          </strong>
        </div>
      `).join("")}
    `;

    showMessage("klcAdminStatus", "Private vote totals loaded for " + currentDate);
  } catch (error) {
    showMessage("klcAdminStatus", error.message);
  }
}


/* =====================================================
   19. ADMIN — PUBLISH RESULTS
   ===================================================== */

async function publishResults() {
  try {
    if (!currentUser || currentUser.uid !== ADMIN_UID) {
      throw new Error("Administrator access required.");
    }

    const result = await calculateRankings();

    await set(
      ref(db, "leadershipDailyResults/" + currentDate),
      result
    );

    showMessage("klcAdminStatus", "Official results published successfully.");

    alert("Official leadership results have been published.");
  } catch (error) {
    showMessage("klcAdminStatus", "Publishing failed: " + error.message);
    alert("Could not publish results: " + error.message);
  }
}


/* =====================================================
   20. ADMIN — CLOSE VOTING AND PUBLISH FINAL RESULTS
   ===================================================== */

async function closeVoting() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    alert("Administrator access required.");
    return;
  }

  if (currentClosed) {
    alert("Voting is already closed for today.");
    return;
  }

  const confirmed = confirm(
    "Close today's voting permanently and publish the final results? This action cannot be reversed from this panel."
  );

  if (!confirmed) return;

  try {
    await set(
      ref(db, "leadershipDailySettings/" + currentDate + "/closed"),
      true
    );

    currentClosed = true;

    const result = await calculateRankings();

    result.closed = true;
    result.updatedAt = Date.now();

    await set(
      ref(db, "leadershipDailyResults/" + currentDate),
      result
    );

    showMessage("klcAdminStatus", "Voting closed. Final results published.");

    alert("Voting has been closed and the final results are now published.");
  } catch (error) {
    showMessage("klcAdminStatus", "Could not complete closure: " + error.message);
    alert("Admin action failed: " + error.message);
  }
}


/* =====================================================
   21. ADMIN PANEL ACCESS
   ===================================================== */

function configureAdmin() {
  const isAdmin =
    currentUser && currentUser.uid === ADMIN_UID;

  $("klcAdminPanel").style.display =
    isAdmin ? "block" : "none";
}


/* =====================================================
   22. AUTHENTICATION
   ===================================================== */

onAuthStateChanged(auth, user => {
  currentUser = user || null;

  configureAdmin();

  if (user) {
    startMyVoteListener();
  }

  renderMyStatus();
  renderContestants();
});


/* =====================================================
   23. BUTTON EVENTS
   ===================================================== */

$("klcJoinBtn").addEventListener("click", joinChallenge);

$("klcSearch").addEventListener("input", renderContestants);

$("klcContestants").addEventListener("click", event => {
  const button = event.target.closest("[data-candidate]");

  if (!button) return;

  castVote(button.dataset.candidate);
});

$("klcRefreshVotes").addEventListener("click", viewPrivateVotes);

$("klcPublishResults").addEventListener("click", publishResults);

$("klcCloseVoting").addEventListener("click", closeVoting);


/* =====================================================
   24. START DATABASE LISTENERS
   ===================================================== */

if (!listenersStarted) {
  listenersStarted = true;

  startEntryListener();
  startSettingsListener();
  startResultsListener();
}
